import * as TypeORM from "typeorm";
import Model from "./common";

declare var syzoj, ErrorMessage: any;

import User from "./user";
import Problem from "./problem";
import ContestRanklist from "./contest_ranklist";
import ContestPlayer from "./contest_player";
import ContestGroupMap from "./contest_group_map";
import Group from "./group";

enum ContestType {
  NOI = "noi",
  IOI = "ioi",
  ICPC = "acm"
}

@TypeORM.Entity()
export default class Contest extends Model {
  static cache = true;

  @TypeORM.PrimaryGeneratedColumn()
  id: number;

  @TypeORM.Column({ nullable: true, type: "varchar", length: 80 })
  title: string;

  @TypeORM.Column({ nullable: true, type: "text" })
  subtitle: string;

  @TypeORM.Column({ nullable: true, type: "integer" })
  start_time: number;

  @TypeORM.Column({ nullable: true, type: "integer" })
  end_time: number;

  @TypeORM.Index()
  @TypeORM.Column({ nullable: true, type: "integer" })
  holder_id: number;

  // type: noi, ioi, acm
  @TypeORM.Column({ nullable: true, type: "enum", enum: ContestType })
  type: ContestType;

  @TypeORM.Column({ nullable: true, type: "text" })
  information: string;

  @TypeORM.Column({ nullable: true, type: "text" })
  problems: string;

  @TypeORM.Column({ nullable: true, type: "text" })
  admins: string;

  @TypeORM.Index()
  @TypeORM.Column({ nullable: true, type: "integer" })
  ranklist_id: number;

  @TypeORM.Index()
  @TypeORM.Column({ nullable: true, type: "integer" })
  ranklist2_id: number;

  @TypeORM.Column({ nullable: true, type: "boolean" })
  is_public: boolean;

  @TypeORM.Column({ nullable: true, type: "boolean" })
  hide_statistics: boolean;

  @TypeORM.Column({ nullable: true, type: "boolean", default: true })
  read_rating: boolean;

  holder?: User;
  ranklist?: ContestRanklist;
  ranklist2?: ContestRanklist;

  async loadRelationships() {
    this.holder = await User.findById(this.holder_id);
    this.ranklist = await ContestRanklist.findById(this.ranklist_id);
    this.ranklist2 = await ContestRanklist.findById(this.ranklist2_id);
    if (!this.ranklist2) {
      let ranklist2 = await ContestRanklist.create({
        ranking_params: this.ranklist.ranking_params,
        ranklist: this.ranklist.ranklist
      });
      for (let i = 1; i <= ranklist2.ranklist.player_num; i++) {
        let player = await ContestPlayer.findById(ranklist2.ranklist[i]);
        let new_player = await ContestPlayer.create({
          contest_id: -this.id,
          user_id: player.user_id,
          score: player.score,
          score_details: player.score_details,
          time_spent: player.time_spent
        });
        await new_player.save();
        ranklist2.ranklist[i] = new_player.id;
      }
      await ranklist2.save();
      this.ranklist2 = ranklist2;
      this.ranklist2_id = ranklist2.id;
      await this.save();
    }
  }

  async isSupervisior(user) {
    return user && (user.is_admin || (await user.hasPrivilege('manage_problem')) || this.holder_id === user.id || this.admins.split('|').includes(user.id.toString()));
  }

  allowedSeeingOthers() {
    if (this.type === 'acm') return true;
    else return false;
  }

  allowedSeeingScore() { // If not, then the user can only see status
    if (this.type === 'ioi') return true;
    else return false;
  }

  allowedSeeingResult() { // If not, then the user can only see compile progress
    if (this.type === 'ioi' || this.type === 'acm') return true;
    else return false;
  }

  allowedSeeingTestcase() {
    if (this.type === 'ioi') return true;
    return false;
  }

  async getProblems() {
    if (!this.problems) return [];
    return this.problems.split('|').map(x => parseInt(x));
  }

  async setProblemsNoCheck(problemIDs) {
    this.problems = problemIDs.join('|');
  }

  async setProblems(s) {
    let a = [];
    await s.split('|').forEachAsync(async x => {
      let problem = await Problem.findById(x);
      if (!problem) return;
      a.push(x);
    });
    this.problems = a.join('|');
  }

  async newSubmission(judge_state) {
    if (!(judge_state.submit_time >= this.start_time)) {
      return;
    }
    let problems = await this.getProblems();
    if (!problems.includes(judge_state.problem_id)) throw new ErrorMessage('当前比赛中无此题目。');

    await syzoj.utils.lock(['Contest::newSubmission', judge_state.user_id], async () => {
      if (judge_state.submit_time <= this.end_time) {
        let player = await ContestPlayer.findInContest({
          contest_id: this.id,
          user_id: judge_state.user_id
        });

        if (!player) {
          player = await ContestPlayer.create({
            contest_id: this.id,
            user_id: judge_state.user_id
          });
          await player.save();
        }

        await player.updateScore(judge_state);
        await player.save();

        await this.loadRelationships();
        await this.ranklist.updatePlayer(this, player);
        await this.ranklist.save();
      }
      let player2 = await ContestPlayer.findInContest({
        contest_id: -this.id,
        user_id: judge_state.user_id
      });

      if (!player2) {
        player2 = await ContestPlayer.create({
          contest_id: -this.id,
          user_id: judge_state.user_id
        });
        await player2.save();
      }

      await player2.updateScore(judge_state);
      await player2.save();

      await this.loadRelationships();
      await this.ranklist2.updatePlayer(this, player2);
      await this.ranklist2.save();
    });
  }

  isRunning(now?) {
    if (!now) now = syzoj.utils.getCurrentDate();
    return now >= this.start_time && now < this.end_time;
  }

  isEnded(now?) {
    if (!now) now = syzoj.utils.getCurrentDate();
    return now >= this.end_time;
  }

  async getGroups() {
    let GroupIDs;
    
    let maps = await ContestGroupMap.find({
      where: {
        contest_id: this.id
      }
    });

    GroupIDs = maps.map(x => x.group_id);

    let res = await (GroupIDs as any).mapAsync(async GroupID => {
      return Group.findById(GroupID);
    });

    res.sort((a, b) => {
      return a.id > b.id ? 1 : -1;
    });

    return res;
  }

  async addGroups(newGroupID) {
    let oldGroupIDs = (await this.getGroups()).map(x => x.name);

    if (oldGroupIDs.includes(newGroupID)) throw new ErrorMessage('此比赛已经属于该比赛组。');

    let pos = await Group.findOne({
      where: {
        name: newGroupID
      }
    });

    if (!pos) throw new ErrorMessage('不存在此组名称');

    let map = await ContestGroupMap.create({
      contest_id: this.id,
      group_id: pos.id
    });

    await map.save();
  }

  async delGroups(delGroupID) {
    let oldGroupIDs = (await this.getGroups()).map(x => x.id);

    if (!oldGroupIDs.includes(delGroupID)) throw new ErrorMessage('此比赛不属于该比赛组。');

    let map = await ContestGroupMap.findOne({
      where: {
        contest_id: this.id,
        group_id: delGroupID
      }
    });

    await map.destroy();
  }

  async isAllowedManageBy(user) {
    if (!user) return false;
    if (await user.hasPrivilege('manage_problem')) return true;
    return await this.isSupervisior(user);
  }

  async isAllowedUseBy(user) {
    if (this.is_public) {
      if ((await this.getGroups()).length == 0) return true;
      if (!user) return false;
      if (await this.isSupervisior(user)) return true;
      if ((await user.getPermissionInContest(this))) return true;
      else return false;
    }
    if (!user) return false;
    if (await user.hasPrivilege('manage_problem')) return true;
    return await this.isSupervisior(user);
  }
}