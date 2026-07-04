CREATE TABLE `Job` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(512) NOT NULL,
  `company` VARCHAR(512) NOT NULL,
  `location` VARCHAR(512) NOT NULL,
  `salary` VARCHAR(255) NULL,
  `employmentType` VARCHAR(255) NULL,
  `workMode` ENUM('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  `postedAt` DATETIME(3) NULL,
  `description` TEXT NULL,
  `technologies` JSON NOT NULL,
  `applyUrl` VARCHAR(512) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `sourceJobId` VARCHAR(255) NULL,
  `fingerprint` VARCHAR(512) NOT NULL,
  `status` ENUM('NEW', 'SAVED', 'APPLIED', 'ARCHIVED') NOT NULL DEFAULT 'NEW',
  `favorite` BOOLEAN NOT NULL DEFAULT false,
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ScrapeRun` (
  `id` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `status` VARCHAR(64) NOT NULL,
  `jobsFound` INTEGER NOT NULL DEFAULT 0,
  `jobsCreated` INTEGER NOT NULL DEFAULT 0,
  `jobsUpdated` INTEGER NOT NULL DEFAULT 0,
  `error` TEXT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `Job_applyUrl_key` ON `Job`(`applyUrl`);
CREATE UNIQUE INDEX `Job_fingerprint_key` ON `Job`(`fingerprint`);
CREATE INDEX `Job_source_idx` ON `Job`(`source`);
CREATE INDEX `Job_company_idx` ON `Job`(`company`);
CREATE INDEX `Job_status_idx` ON `Job`(`status`);
CREATE INDEX `Job_favorite_idx` ON `Job`(`favorite`);
CREATE INDEX `Job_postedAt_idx` ON `Job`(`postedAt`);
