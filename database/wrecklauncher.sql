-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Sep 18, 2025 at 09:19 AM
-- Server version: 9.1.0
-- PHP Version: 8.3.14

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `wrecklauncher`
--

-- --------------------------------------------------------

--
-- Table structure for table `chats`
--

DROP TABLE IF EXISTS `chats`;
CREATE TABLE IF NOT EXISTS `chats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `friends_id` int NOT NULL,
  `message` varchar(1000) NOT NULL,
  `sender_id` binary(16) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `friends_id` (`friends_id`),
  KEY `sender_id` (`sender_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `friends`
--

DROP TABLE IF EXISTS `friends`;
CREATE TABLE IF NOT EXISTS `friends` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user1_id` binary(16) NOT NULL,
  `user2_id` binary(16) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user1_id` (`user1_id`),
  KEY `user2_id` (`user2_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `games`
--

DROP TABLE IF EXISTS `games`;
CREATE TABLE IF NOT EXISTS `games` (
  `id` smallint NOT NULL AUTO_INCREMENT,
  `platform_id` smallint DEFAULT NULL,
  `name` varchar(256) NOT NULL,
  `banner_img` varchar(516) DEFAULT NULL,
  `pfp` varchar(516) DEFAULT NULL,
  `cost` smallint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `platform_id` (`platform_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `game_pirate`
--

DROP TABLE IF EXISTS `game_pirate`;
CREATE TABLE IF NOT EXISTS `game_pirate` (
  `game_id` smallint NOT NULL,
  `site_id` tinyint NOT NULL,
  `link` varchar(516) NOT NULL,
  KEY `game_id` (`game_id`),
  KEY `site_id` (`site_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `native_users`
--

DROP TABLE IF EXISTS `native_users`;
CREATE TABLE IF NOT EXISTS `native_users` (
  `id` binary(16) NOT NULL DEFAULT (uuid_to_bin(uuid())),
  `name` varchar(32) NOT NULL,
  `user_password` varchar(100) NOT NULL,
  `pfp` varchar(516) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pirate_sites`
--

DROP TABLE IF EXISTS `pirate_sites`;
CREATE TABLE IF NOT EXISTS `pirate_sites` (
  `id` tinyint NOT NULL AUTO_INCREMENT,
  `name` varchar(10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `platforms`
--

DROP TABLE IF EXISTS `platforms`;
CREATE TABLE IF NOT EXISTS `platforms` (
  `id` tinyint NOT NULL AUTO_INCREMENT,
  `platform_name` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `platform_users`
--

DROP TABLE IF EXISTS `platform_users`;
CREATE TABLE IF NOT EXISTS `platform_users` (
  `id` smallint NOT NULL AUTO_INCREMENT,
  `user_id` binary(16) NOT NULL,
  `platform_id` smallint NOT NULL,
  `platform_profile_id` varchar(17) NOT NULL,
  `platform_name` varchar(32) DEFAULT NULL,
  `platform_password` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `platform_id` (`platform_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
