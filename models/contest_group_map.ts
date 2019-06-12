import * as TypeORM from "typeorm";
import Model from "./common";

@TypeORM.Entity()
export default class ContestGroupMap extends Model {
  @TypeORM.Index()
  @TypeORM.PrimaryColumn({ type: "integer" })
  contest_id: number;

  @TypeORM.Index()
  @TypeORM.PrimaryColumn({ type: "integer" })
  group_id: number;
}
