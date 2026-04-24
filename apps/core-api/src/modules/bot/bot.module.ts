import { Module } from "@nestjs/common";
import { FunTimeModule } from "../funtime/funtime.module";
import { BotController } from "./bot.controller";
import { BotConfigModule } from "../bot-config/bot-config.module";

@Module({
  imports: [FunTimeModule, BotConfigModule],
  controllers: [BotController]
})
export class BotModule {}
