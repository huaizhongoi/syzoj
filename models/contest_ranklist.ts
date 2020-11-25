import * as TypeORM from "typeorm";
import Model from "./common";

declare var syzoj: any;

import ContestPlayer from "./contest_player";
import JudgeState from "./judge_state";

@TypeORM.Entity()
export default class ContestRanklist extends Model {
    @TypeORM.PrimaryGeneratedColumn()
    id: number;

    @TypeORM.Column({ nullable: true, type: "json" })
    ranking_params: any;

    @TypeORM.Column({ default: JSON.stringify({ player_num: 0 }), type: "json" })
    ranklist: any;

    async getPlayers() {
        let a = [];
        for (let i = 1; i <= this.ranklist.player_num; i++) {
            a.push(await ContestPlayer.findById(this.ranklist[i]));
        }
        return a;
    }

    async updatePlayer(contest, player) {
        let players = await this.getPlayers(), newPlayer = true;
        for (let x of players) {
            if (x.user_id === player.user_id) {
                newPlayer = false;
                break;
            }
        }

        if (newPlayer) {
            players.push(player);
        }

        for (let player of players) {
            player.latest = 0;
            player.score = 0;

            for (let i in player.score_details) {
                let judge_state = await JudgeState.findById(player.score_details[i].judge_id);
                if (!judge_state) continue;

                if (player.score_details[i].score != null) {
                    let multiplier = this.ranking_params[i] || 1.0;
                    player.score_details[i].weighted_score = Math.round(player.score_details[i].score * multiplier);
                    player.score += player.score_details[i].weighted_score;
                    player.latest += player.score_details[i].total_time;
                }
            }
        }

        players.sort((a, b) => {
            if (a.score > b.score) return -1;
            if (b.score > a.score) return 1;
            let asum = 0, bsum = 0;
            for (let i in a.score_details) {
                let judge_state = await JudgeState.findById(a.score_details[i].judge_id);
                if (!judge_state) continue;

                if (a.score_details[i].score != null) {
                    if(a.score_details[i].weighted_score != 0){
                        asum += a.score_details[i].total_time;
                    }
                }
            }
            for (let i in b.score_details) {
                let judge_state = await JudgeState.findById(b.score_details[i].judge_id);
                if (!judge_state) continue;

                if (b.score_details[i].score != null) {
                    if(b.score_details[i].weighted_score != 0){
                        bsum += b.score_details[i].total_time;
                    }
                }
            }
            if (bsum > asum) return 1;
            if (asum > bsum) return -1;
            return 0;
        });

        this.ranklist = { player_num: players.length };
        for (let i = 0; i < players.length; i++) this.ranklist[i + 1] = players[i].id;
    }
}
