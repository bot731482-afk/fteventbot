import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { PrismaService } from "./modules/prisma/prisma.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix("v1");
  const portCandidate = Number(process.env.CORE_API_PORT ?? process.env.PORT ?? "3000");
  const port = Number.isInteger(portCandidate) && portCandidate > 0 && portCandidate <= 65535 ? portCandidate : 3000;
  const host = (process.env.CORE_API_HOST ?? "0.0.0.0").trim();
  if ((process.env.PRISMA_ENABLED ?? "true").trim().toLowerCase() !== "false") {
    const prismaService = app.get(PrismaService);
    await prismaService.enableShutdownHooks(app);
  }
  await app.listen(port, host);
}

void bootstrap().catch((error) => {
  console.error("core-api bootstrap failed", error);
  process.exit(1);
});
