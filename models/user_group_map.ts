import * as TypeORM from "typeorm";
import Model from "./common";

@TypeORM.Entity()
export default class UserGroupMap extends Model {
  @TypeORM.Index()
  @TypeORM.PrimaryColumn({ type: "integer" })
  user_id: number;

  @TypeORM.Index()
  @TypeORM.PrimaryColumn({ type: "integer" })
  group_id: number;

  @TypeORM.Index()
  @TypeORM.Column({ type: "integer" })
  level: number;
}
