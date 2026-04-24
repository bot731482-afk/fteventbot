import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { PrismaService } from "./modules/prisma/prisma.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix("v1");
  const port = Number(process.env.CORE_API_PORT ?? process.env.PORT ?? "3000");
  const host = (process.env.CORE_API_HOST ?? "0.0.0.0").trim();
  if ((process.env.PRISMA_ENABLED ?? "true").trim().toLowerCase() !== "false") {
    const prismaService = app.get(PrismaService);
    await prismaService.enableShutdownHooks(app);
  }
  await app.listen(port, host);
}

void bootstrap();
