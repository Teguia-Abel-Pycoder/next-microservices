-- CreateTable
CREATE TABLE `Article` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `gender` ENUM('MALE', 'FEMALE', 'UNISEX') NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `price` DOUBLE NOT NULL,
    `category` ENUM('Pants', 'Shirts', 'Pullovers', 'Jackets', 'TShirts', 'Blouses', 'Polo', 'CropTops', 'HatsCaps', 'Socks', 'Accessories') NOT NULL,
    `state` ENUM('NEW', 'USED') NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL,
    `size` ENUM('BABY', 'CHILD', 'ADULT') NOT NULL,
    `babySize` ENUM('ThreeMonths', 'ThreeToSixMonths', 'SixToNineMonths', 'NineToTwelveMonths', 'TwelveToEighteenMonths', 'EighteenToTwentyFourMonths') NULL,
    `childSize` ENUM('TwoToFourYears', 'FourToSixYears', 'SixToEightYears', 'EightToTenYears', 'TenToTwelveYears') NULL,
    `adultSize` ENUM('XS', 'S', 'M', 'L', 'XL', 'XXL', 'ThreeXL', 'FourXL', 'FiveXL') NULL,
    `owner` VARCHAR(191) NOT NULL,
    `boughtBy` VARCHAR(191) NULL,
    `offers` JSON NULL,
    `creationDate` DATETIME(3) NOT NULL,
    `images` VARCHAR(191) NOT NULL,
    `perishable` BOOLEAN NOT NULL,
    `published` BOOLEAN NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
