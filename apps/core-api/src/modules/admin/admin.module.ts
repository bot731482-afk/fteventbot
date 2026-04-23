import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { FunTimeModule } from "../funtime/funtime.module";
import { AdminService } from "./admin.service";

@Module({
  imports: [FunTimeModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
