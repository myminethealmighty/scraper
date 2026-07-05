CREATE TABLE `TelegramUser` (
  `id` VARCHAR(191) NOT NULL,
  `chatId` VARCHAR(64) NOT NULL,
  `username` VARCHAR(191) NULL,
  `firstName` VARCHAR(191) NULL,
  `lastName` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SearchProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `frequency` VARCHAR(64) NOT NULL DEFAULT 'daily',
  `maxJobAgeDays` INTEGER NOT NULL DEFAULT 92,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SearchSource` (
  `id` VARCHAR(191) NOT NULL,
  `profileId` VARCHAR(191) NOT NULL,
  `sourceKey` VARCHAR(64) NOT NULL,
  `sourceName` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SearchTerm` (
  `id` VARCHAR(191) NOT NULL,
  `profileId` VARCHAR(191) NOT NULL,
  `value` VARCHAR(191) NOT NULL,
  `normalizedValue` VARCHAR(191) NOT NULL,
  `type` ENUM('ROLE', 'SKILL', 'KEYWORD', 'LOCATION', 'COMPANY') NOT NULL DEFAULT 'KEYWORD',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserJobMatch` (
  `id` VARCHAR(191) NOT NULL,
  `profileId` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `score` INTEGER NOT NULL DEFAULT 0,
  `matchedTerms` JSON NOT NULL,
  `matchedFields` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NotificationLog` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `profileId` VARCHAR(191) NULL,
  `jobId` VARCHAR(191) NULL,
  `channel` ENUM('TELEGRAM', 'DISCORD') NOT NULL,
  `recipient` VARCHAR(191) NOT NULL,
  `status` ENUM('SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'SENT',
  `messageHash` VARCHAR(191) NULL,
  `error` TEXT NULL,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TaxonomyTerm` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `normalizedName` VARCHAR(191) NOT NULL,
  `category` ENUM('ROLE', 'SKILL', 'KEYWORD', 'LOCATION', 'COMPANY') NOT NULL DEFAULT 'KEYWORD',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TaxonomyAlias` (
  `id` VARCHAR(191) NOT NULL,
  `termId` VARCHAR(191) NOT NULL,
  `alias` VARCHAR(191) NOT NULL,
  `normalizedAlias` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `TelegramUser_chatId_key` ON `TelegramUser`(`chatId`);
CREATE INDEX `TelegramUser_isActive_idx` ON `TelegramUser`(`isActive`);
CREATE INDEX `SearchProfile_userId_idx` ON `SearchProfile`(`userId`);
CREATE INDEX `SearchProfile_enabled_idx` ON `SearchProfile`(`enabled`);
CREATE UNIQUE INDEX `SearchSource_profileId_sourceKey_key` ON `SearchSource`(`profileId`, `sourceKey`);
CREATE INDEX `SearchSource_sourceKey_idx` ON `SearchSource`(`sourceKey`);
CREATE INDEX `SearchSource_enabled_idx` ON `SearchSource`(`enabled`);
CREATE UNIQUE INDEX `SearchTerm_profileId_normalizedValue_type_key` ON `SearchTerm`(`profileId`, `normalizedValue`, `type`);
CREATE INDEX `SearchTerm_normalizedValue_idx` ON `SearchTerm`(`normalizedValue`);
CREATE INDEX `SearchTerm_type_idx` ON `SearchTerm`(`type`);
CREATE UNIQUE INDEX `UserJobMatch_profileId_jobId_key` ON `UserJobMatch`(`profileId`, `jobId`);
CREATE INDEX `UserJobMatch_jobId_idx` ON `UserJobMatch`(`jobId`);
CREATE INDEX `UserJobMatch_score_idx` ON `UserJobMatch`(`score`);
CREATE UNIQUE INDEX `NotificationLog_userId_jobId_channel_key` ON `NotificationLog`(`userId`, `jobId`, `channel`);
CREATE INDEX `NotificationLog_profileId_idx` ON `NotificationLog`(`profileId`);
CREATE INDEX `NotificationLog_status_idx` ON `NotificationLog`(`status`);
CREATE INDEX `NotificationLog_sentAt_idx` ON `NotificationLog`(`sentAt`);
CREATE UNIQUE INDEX `TaxonomyTerm_name_key` ON `TaxonomyTerm`(`name`);
CREATE UNIQUE INDEX `TaxonomyTerm_normalizedName_key` ON `TaxonomyTerm`(`normalizedName`);
CREATE INDEX `TaxonomyTerm_category_idx` ON `TaxonomyTerm`(`category`);
CREATE UNIQUE INDEX `TaxonomyAlias_normalizedAlias_key` ON `TaxonomyAlias`(`normalizedAlias`);
CREATE INDEX `TaxonomyAlias_termId_idx` ON `TaxonomyAlias`(`termId`);

ALTER TABLE `SearchProfile` ADD CONSTRAINT `SearchProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `TelegramUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SearchSource` ADD CONSTRAINT `SearchSource_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `SearchProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SearchTerm` ADD CONSTRAINT `SearchTerm_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `SearchProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserJobMatch` ADD CONSTRAINT `UserJobMatch_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `SearchProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserJobMatch` ADD CONSTRAINT `UserJobMatch_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NotificationLog` ADD CONSTRAINT `NotificationLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `TelegramUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NotificationLog` ADD CONSTRAINT `NotificationLog_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `SearchProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `NotificationLog` ADD CONSTRAINT `NotificationLog_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `TaxonomyAlias` ADD CONSTRAINT `TaxonomyAlias_termId_fkey` FOREIGN KEY (`termId`) REFERENCES `TaxonomyTerm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
