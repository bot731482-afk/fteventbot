import { Module } from "@nestjs/common";
import { FunTimeModule } from "../funtime/funtime.module";
import { BotController } from "./bot.controller";

@Module({
  imports: [FunTimeModule],
  controllers: [BotController]
})
export class BotModule {}
