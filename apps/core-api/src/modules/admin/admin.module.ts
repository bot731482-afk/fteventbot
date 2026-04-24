import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { AdminController } from "./admin.controller";
import { FunTimeModule } from "../funtime/funtime.module";
import { AdminService } from "./admin.service";

@Module({
  imports: [FunTimeModule, AccessModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
