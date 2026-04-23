import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { PrismaService } from "./modules/prisma/prisma.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix("v1");
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);
  await app.listen(3000);
}

void bootstrap();
