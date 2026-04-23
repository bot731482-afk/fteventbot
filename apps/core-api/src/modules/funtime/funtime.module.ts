import { Module } from "@nestjs/common";
import { FunTimeGateway } from "./funtime.gateway";
import { FunTimeService } from "./funtime.service";

@Module({
  providers: [FunTimeGateway, FunTimeService],
  exports: [FunTimeService]
})
export class FunTimeModule {}
