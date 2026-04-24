import { Module } from "@nestjs/common";
import { FunTimeModule } from "./funtime/funtime.module";
import { BillingModule } from "./billing/billing.module";
import { NotificationModule } from "./notification/notification.module";
import { AdminModule } from "./admin/admin.module";
import { PrismaModule } from "./prisma/prisma.module";
import { BotModule } from "./bot/bot.module";
import { BotConfigModule } from "./bot-config/bot-config.module";

@Module({
  imports: [PrismaModule, FunTimeModule, BillingModule, NotificationModule, AdminModule, BotModule, BotConfigModule]
})
export class AppModule {}
