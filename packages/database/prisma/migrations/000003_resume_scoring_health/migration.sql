CREATE TABLE `ScrapeHealth` (
  `id` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `lastAttemptAt` DATETIME(3) NULL,
  `lastSuccessAt` DATETIME(3) NULL,
  `cooldownUntil` DATETIME(3) NULL,
  `consecutiveFailures` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ResumeProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `skills` JSON NOT NULL,
  `roles` JSON NOT NULL,
  `locations` JSON NOT NULL,
  `keywords` JSON NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `JobScore` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `score` INTEGER NOT NULL DEFAULT 0,
  `matchedSkills` JSON NOT NULL,
  `matchedRoles` JSON NOT NULL,
  `matchedFields` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `ScrapeHealth_source_key` ON `ScrapeHealth`(`source`);
CREATE INDEX `ScrapeHealth_cooldownUntil_idx` ON `ScrapeHealth`(`cooldownUntil`);
CREATE INDEX `ScrapeHealth_lastSuccessAt_idx` ON `ScrapeHealth`(`lastSuccessAt`);
CREATE UNIQUE INDEX `ResumeProfile_userId_key` ON `ResumeProfile`(`userId`);
CREATE INDEX `ResumeProfile_updatedAt_idx` ON `ResumeProfile`(`updatedAt`);
CREATE UNIQUE INDEX `JobScore_userId_jobId_key` ON `JobScore`(`userId`, `jobId`);
CREATE INDEX `JobScore_jobId_idx` ON `JobScore`(`jobId`);
CREATE INDEX `JobScore_score_idx` ON `JobScore`(`score`);

ALTER TABLE `ResumeProfile` ADD CONSTRAINT `ResumeProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `TelegramUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `JobScore` ADD CONSTRAINT `JobScore_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `TelegramUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `JobScore` ADD CONSTRAINT `JobScore_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
