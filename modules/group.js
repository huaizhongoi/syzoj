let Group = syzoj.model('group');

app.get('/group/:id/edit', async (req, res) => {
  try {
    if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_group')) throw new ErrorMessage('您没有权限进行此操作。');

    let id = parseInt(req.params.id) || 0;
    let group = await Group.findById(id);

    if (!group) {
      group = await Group.create();
      group.id = id;
    }

    res.render('group_edit', {
      group: group
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.post('/group/:id/edit', async (req, res) => {
  try {
    if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_group')) throw new ErrorMessage('您没有权限进行此操作。');

    let id = parseInt(req.params.id) || 0;
    let group = await Group.findById(id);

    if (!group) {
      group = await Group.create();
      group.id = id;
    }

    req.body.name = req.body.name.trim();
    if (group.name !== req.body.name) {
      if (await Group.findOne({ where: { name: req.body.name } })) {
        throw new ErrorMessage('组名称已被使用。');
      }
    }

    group.name = req.body.name;
    group.color = req.body.color;

    await group.save();

    res.redirect(syzoj.utils.makeUrl(['problems', 'group', group.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});
