import { Module } from "@nestjs/common";
import { AdminBotConfigController, PublicBotConfigController } from "./bot-config.controller";
import { BotConfigService } from "./bot-config.service";

@Module({
  controllers: [AdminBotConfigController, PublicBotConfigController],
  providers: [BotConfigService],
  exports: [BotConfigService]
})
export class BotConfigModule {}

