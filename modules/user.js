let User = syzoj.model('user');
let Group = syzoj.model('group');
const RatingCalculation = syzoj.model('rating_calculation');
const RatingHistory = syzoj.model('rating_history');
const Contest = syzoj.model('contest');
const ContestPlayer = syzoj.model('contest_player');

// Ranklist
app.get('/ranklist', async (req, res) => {
  try {
    const sort = req.query.sort || syzoj.config.sorting.ranklist.field;
    const order = req.query.order || syzoj.config.sorting.ranklist.order;
    if (!['ac_num', 'rating', 'id', 'username'].includes(sort) || !['asc', 'desc'].includes(order)) {
      throw new ErrorMessage('错误的排序参数。');
    }
    let paginate = syzoj.utils.paginate(await User.countForPagination({ is_show: true }), req.query.page, syzoj.config.page.ranklist);
    let ranklist = await User.queryPage(paginate, { is_show: true }, { [sort]: order.toUpperCase() });
    await ranklist.forEachAsync(async x => x.renderInformation());

    res.render('ranklist', {
      ranklist: ranklist,
      paginate: paginate,
      curSort: sort,
      curOrder: order === 'asc',
      show_realname: res.locals.user && (await res.locals.user.hasPrivilege('see_realname')),
      show_group: false
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/ranklist/group/:gid', async (req, res) => {
  try {
    const sort = req.query.sort || syzoj.config.sorting.ranklist.field;
    const order = req.query.order || syzoj.config.sorting.ranklist.order;
    let gid = parseInt(req.params.gid);
    if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_problem')) throw new ErrorMessage('您没有权限进行此操作。');

    let get_group = await Group.findById(gid);
    if (!get_group) return res.redirect(syzoj.utils.makeUrl(['ranklist']));

    if (!['ac_num', 'rating', 'id', 'username', 'level'].includes(sort) || !['asc', 'desc'].includes(order)) {
      throw new ErrorMessage('错误的排序参数。');
    }

    let query = User.createQueryBuilder();
    query.where('EXISTS (SELECT * FROM user_group_map WHERE user_id = id && group_id = :gid)', { gid: gid })
         .andWhere('is_show = true');
    if (sort != 'level') query.orderBy(sort, order.toUpperCase());

    let paginate = syzoj.utils.paginate(await User.countForPagination(query), req.query.page, syzoj.config.page.ranklist);
    let ranklist = await User.queryPage(paginate, query);
    await ranklist.forEachAsync(async x => x.renderInformation());
    await ranklist.forEachAsync(async x => {
      x.level = await x.getLevelInGroup(gid);
    });
    if (sort == 'level') {
      ranklist.sort((a, b) => {
        if (order == 'asc') return a.level > b.level ? 1 : -1;
        else return a.level < b.level ? 1 : -1;
      });
    }

    res.render('ranklist', {
      ranklist: ranklist,
      paginate: paginate,
      curSort: sort,
      curOrder: order === 'asc',
      show_realname: res.locals.user && (await res.locals.user.hasPrivilege('see_realname')),
      show_group: true,
      group: get_group
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/find_user', async (req, res) => {
  try {
    let user = await User.fromName(req.query.nickname);
    if (!user) throw new ErrorMessage('无此用户。');
    res.redirect(syzoj.utils.makeUrl(['user', user.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

// Login
app.get('/login', async (req, res) => {
  if (res.locals.user) {
    res.render('error', {
      err: new ErrorMessage('您已经登录了，请先注销。', { '注销': syzoj.utils.makeUrl(['logout'], { 'url': req.originalUrl }) })
    });
  } else {
    res.render('login');
  }
});

// Sign up
app.get('/sign_up', async (req, res) => {
  if (res.locals.user) {
    res.render('error', {
      err: new ErrorMessage('您已经登录了，请先注销。', { '注销': syzoj.utils.makeUrl(['logout'], { 'url': req.originalUrl }) })
    });
  } else {
    res.render('sign_up');
  }
});

// Logout
app.post('/logout', async (req, res) => {
  req.session.user_id = null;
  res.clearCookie('login');
  res.redirect(req.query.url || '/');
});

// User page
app.get('/user/:id', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
    user.ac_problems = await user.getACProblems();
    user.articles = await user.getArticles();
    user.allowedEdit = await user.isAllowedEditBy(res.locals.user);
    if (res.locals.user) user.allowedEditGroup = await res.locals.user.hasPrivilege('manage_problem');
    else user.allowedEditGroup = false;

    let statistics = await user.getStatistics();
    await user.renderInformation();
    user.emailVisible = user.public_email || user.allowedEdit;

    const ratingHistoryValues = await RatingHistory.find({
      where: { user_id: user.id },
      order: { rating_calculation_id: 'ASC' }
    });
    const ratingHistories = [{
      contestName: "初始积分",
      value: syzoj.config.default.user.rating,
      delta: null,
      rank: null
    }];

    for (const history of ratingHistoryValues) {
      const contest = await Contest.findById((await RatingCalculation.findById(history.rating_calculation_id)).contest_id);
      console.log(history);
      console.log(contest);
      ratingHistories.push({
        contestName: contest.title,
        value: history.rating_after,
        delta: history.rating_after - ratingHistories[ratingHistories.length - 1].value,
        rank: history.rank,
        participants: await ContestPlayer.count({ contest_id: contest.id })
      });
    }
    ratingHistories.reverse();

    let Groups = await user.getGroupsFull();

    await Groups.forEachAsync(async map => {
      let group = await Group.findById(map.group_id);
      map.name = group.name;
      map.color = group.color;
    });
    Groups.sort((a, b) => {
      return a.group_id > b.group_id ? 1 : -1;
    });

    res.render('user', {
      show_user: user,
      statistics: statistics,
      ratingHistories: ratingHistories,
      show_realname: res.locals.user && (await res.locals.user.hasPrivilege('see_realname')),
      groups: Groups
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/user/:id/edit', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');

    let allowedEdit = await user.isAllowedEditBy(res.locals.user);
    if (!allowedEdit) {
      throw new ErrorMessage('您没有权限进行此操作。');
    }

    user.privileges = await user.getPrivileges();

    res.locals.user.allowedManage = await res.locals.user.hasPrivilege('manage_user');

    res.render('user_edit', {
      edited_user: user,
      error_info: null
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/forget', async (req, res) => {
  res.render('forget');
});



app.post('/user/:id/edit', async (req, res) => {
  let user;
  try {
    let id = parseInt(req.params.id);
    user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');

    let allowedEdit = await user.isAllowedEditBy(res.locals.user);
    if (!allowedEdit) throw new ErrorMessage('您没有权限进行此操作。');

    if (req.body.old_password && req.body.new_password) {
      if (user.password !== req.body.old_password && !await res.locals.user.hasPrivilege('manage_user')) throw new ErrorMessage('旧密码错误。');
      user.password = req.body.new_password;
    }

    if (res.locals.user && await res.locals.user.hasPrivilege('manage_user')) {
      if (!syzoj.utils.isValidUsername(req.body.username)) throw new ErrorMessage('无效的用户名。');
      user.username = req.body.username;
      user.email = req.body.email;
    }

    if (!syzoj.utils.isValidRealName(req.body.realname.trim())) throw new ErrorMessage('无效的真实姓名。');
    user.realname = req.body.realname.trim();

    if (res.locals.user && await res.locals.user.hasPrivilege('manage_user')) user.nameplate = req.body.nameplate.trim();

    if (res.locals.user && res.locals.user.is_admin) {
      if (!req.body.privileges) {
        req.body.privileges = [];
      } else if (!Array.isArray(req.body.privileges)) {
        req.body.privileges = [req.body.privileges];
      }

      let privileges = req.body.privileges;
      await user.setPrivileges(privileges);
    }

    user.information = req.body.information;
    user.sex = req.body.sex;
    user.public_email = (req.body.public_email === 'on');
    user.prefer_formatted_code = (req.body.prefer_formatted_code === 'on');

    if (res.locals.user && await res.locals.user.hasPrivilege('manage_user')) {
      if (req.body.disable_login == 'on' && (user.is_admin || await user.hasPrivilege('manage_user') || await user.hasPrivilege('manage_problem'))) throw new ErrorMessage('不能封禁有管理权限的用户');
      user.disable_login = (req.body.disable_login == 'on');
    }

    await user.save();

    if (user.id === res.locals.user.id) res.locals.user = user;

    user.privileges = await user.getPrivileges();
    res.locals.user.allowedManage = await res.locals.user.hasPrivilege('manage_user');

    res.render('user_edit', {
      edited_user: user,
      error_info: ''
    });
  } catch (e) {
    user.privileges = await user.getPrivileges();
    res.locals.user.allowedManage = await res.locals.user.hasPrivilege('manage_user');

    res.render('user_edit', {
      edited_user: user,
      error_info: e.message
    });
  }
});

app.get('/user/:id/group', async (req, res) => {
  try {
    let id = parseInt(req.params.id) || 0;
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
    if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_problem')) throw new ErrorMessage('您没有权限进行此操作。');

    let Groups = await user.getGroupsFull();

    await Groups.forEachAsync(async map => {
      let group = await Group.findById(map.group_id);
      map.name = group.name;
      map.color = group.color;
    });
    Groups.sort((a, b) => {
      return a.group_id > b.group_id ? 1 : -1;
    });

    res.render('user_group', {
      groups: Groups,
      show_user: user
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.post('/user/:id/group', async (req, res) => {
  try {
    let id = parseInt(req.params.id) || 0;
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
    if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_problem')) throw new ErrorMessage('您没有权限进行此操作。');
    if (!req.body.name) throw new ErrorMessage('不合法的组编号或组名称');
    if (!req.body.level || isNaN(req.body.level)) throw new ErrorMessage('不合法的等级');

    let name = req.body.name.trim();
    let level = parseInt(req.body.level);

    if (level != 0 && level != 1 && level != 2) throw new ErrorMessage('不合法的等级');

    await user.addGroups(name, level);

    res.redirect(syzoj.utils.makeUrl(['user', user.id, 'group']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.post('/user/:id/group/delete/:gid', async (req, res) => {
  try {
    let id = parseInt(req.params.id) || 0;
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
    if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_problem')) throw new ErrorMessage('您没有权限进行此操作。');

    await user.delGroups(parseInt(req.params.gid));

    res.redirect(syzoj.utils.makeUrl(['user', user.id, 'group']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});