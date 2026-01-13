-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Gép: 127.0.0.1
-- Létrehozás ideje: 2026. Jan 13. 11:16
-- Kiszolgáló verziója: 10.4.32-MariaDB
-- PHP verzió: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Adatbázis: `wrecklauncher`
--

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `chats`
--

CREATE TABLE `chats` (
  `id` int(11) NOT NULL,
  `friends_id` int(11) NOT NULL,
  `message` varchar(1000) NOT NULL,
  `sender_id` binary(16) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `connect_genres`
--

CREATE TABLE `connect_genres` (
  `genre_id` smallint(6) DEFAULT NULL,
  `game_id` smallint(6) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

--
-- A tábla adatainak kiíratása `connect_genres`
--



-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `friends`
--

CREATE TABLE `friends` (
  `id` int(11) NOT NULL,
  `user1_id` binary(16) NOT NULL,
  `user2_id` binary(16) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `games`
--

CREATE TABLE `games` (
  `id` smallint(6) NOT NULL,
  `app_id` int(11) NOT NULL,
  `platform_id` smallint(6) DEFAULT NULL,
  `name` varchar(256) NOT NULL,
  `banner_img` varchar(516) DEFAULT NULL,
  `pfp` varchar(516) DEFAULT NULL,
  `cost` smallint(3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

--
-- A tábla adatainak kiíratása `games`
--

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `game_pirates`
--

CREATE TABLE `game_pirates` (
  `game_id` smallint(6) NOT NULL,
  `site_id` tinyint(4) NOT NULL,
  `link` varchar(516) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `genres`
--

CREATE TABLE `genres` (
  `id` smallint(6) NOT NULL,
  `genre` varchar(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

--
-- A tábla adatainak kiíratása `genres`
--

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `native_users`
--

CREATE TABLE `native_users` (
  `id` binary(16) NOT NULL,
  `name` varchar(32) NOT NULL,
  `user_password` varchar(100) NOT NULL,
  `pfp` varchar(516) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

--
-- A tábla adatainak kiíratása `native_users`
--

INSERT INTO `native_users` (`id`, `name`, `user_password`, `pfp`) VALUES
(0x00000000000000000000000000000000, 'teszt', 'teszt', 'teszt');

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `pirate_sites`
--

CREATE TABLE `pirate_sites` (
  `id` tinyint(4) NOT NULL,
  `name` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

--
-- A tábla adatainak kiíratása `pirate_sites`
--

INSERT INTO `pirate_sites` (`id`, `name`) VALUES
(1, 'a'),
(2, 's'),
(3, 'd');

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `platforms`
--

CREATE TABLE `platforms` (
  `id` tinyint(4) NOT NULL,
  `platform_name` varchar(10) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

--
-- A tábla adatainak kiíratása `platforms`
--

INSERT INTO `platforms` (`id`, `platform_name`) VALUES
(1, 'steam');

-- --------------------------------------------------------

--
-- Tábla szerkezet ehhez a táblához `platform_users`
--

CREATE TABLE `platform_users` (
  `id` smallint(6) NOT NULL,
  `user_id` binary(16) NOT NULL,
  `platform_id` smallint(6) NOT NULL,
  `platform_profile_id` varchar(17) NOT NULL,
  `platform_username` varchar(64) NOT NULL,
  `platform_password` varchar(64) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;

--
-- A tábla adatainak kiíratása `platform_users`
--

--
-- Indexek a kiírt táblákhoz
--

--
-- A tábla indexei `chats`
--
ALTER TABLE `chats`
  ADD PRIMARY KEY (`id`),
  ADD KEY `friends_id` (`friends_id`),
  ADD KEY `sender_id` (`sender_id`);

--
-- A tábla indexei `connect_genres`
--
ALTER TABLE `connect_genres`
  ADD KEY `genre_id` (`genre_id`),
  ADD KEY `game_id` (`game_id`);

--
-- A tábla indexei `friends`
--
ALTER TABLE `friends`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user1_id` (`user1_id`),
  ADD KEY `user2_id` (`user2_id`);

--
-- A tábla indexei `games`
--
ALTER TABLE `games`
  ADD PRIMARY KEY (`id`),
  ADD KEY `platform_id` (`platform_id`);

--
-- A tábla indexei `game_pirates`
--
ALTER TABLE `game_pirates`
  ADD KEY `game_id` (`game_id`),
  ADD KEY `site_id` (`site_id`);

--
-- A tábla indexei `genres`
--
ALTER TABLE `genres`
  ADD PRIMARY KEY (`id`);

--
-- A tábla indexei `native_users`
--
ALTER TABLE `native_users`
  ADD PRIMARY KEY (`id`);

--
-- A tábla indexei `pirate_sites`
--
ALTER TABLE `pirate_sites`
  ADD PRIMARY KEY (`id`);

--
-- A tábla indexei `platforms`
--
ALTER TABLE `platforms`
  ADD PRIMARY KEY (`id`);

--
-- A tábla indexei `platform_users`
--
ALTER TABLE `platform_users`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `platform_id` (`platform_id`);

--
-- A kiírt táblák AUTO_INCREMENT értéke
--

--
-- AUTO_INCREMENT a táblához `chats`
--
ALTER TABLE `chats`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT a táblához `friends`
--
ALTER TABLE `friends`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT a táblához `games`
--
ALTER TABLE `games`
  MODIFY `id` smallint(6) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1526;

--
-- AUTO_INCREMENT a táblához `genres`
--
ALTER TABLE `genres`
  MODIFY `id` smallint(6) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT a táblához `pirate_sites`
--
ALTER TABLE `pirate_sites`
  MODIFY `id` tinyint(4) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT a táblához `platforms`
--
ALTER TABLE `platforms`
  MODIFY `id` tinyint(4) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT a táblához `platform_users`
--
ALTER TABLE `platform_users`
  MODIFY `id` smallint(6) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
