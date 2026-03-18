
const fetch = require('node-fetch');
const CountiesController = require('../database/controllers/CountiesController.js');
const PricesController = require('../database/controllers/PricesController.js');

module.exports.getCountyIdByCode = async function (countyCode) {
  try {
    const countyCtrl = new CountiesController();
    const resp = await fetch(`https://restcountries.com/v3.1/alpha/${countyCode.toLowerCase()}`);
    if (!resp.ok) {
      throw new Error(`restcountries API ${resp.status}: ${await resp.text()}`);
    }
    const body = await resp.json();
    const country = Array.isArray(body) ? body[0] : body;
    if (!country) throw new Error('No country data returned from restcountries');

    const name = country?.name?.common ?? null;
    let currencySymbol = null;
    const currencies = country?.currencies;
    if (currencies && typeof currencies === 'object') {
      const first = Object.values(currencies)[0];
      currencySymbol = first?.symbol ?? null;
    }

    const county = await countyCtrl.create({ name, code: countyCode, currency: currencySymbol });
    return county?.id ?? null;
  } catch (err) {
    throw err;
  }
}

module.exports.createCountyByCode = async function (countyCode) {
  const countyCtrl = new CountiesController();
  const countyData = await countyCtrl.getByCode(countyCode);
  if (countyData instanceof Error || !countyData?.id) {
    const id = await createCountyByCode(countyCode);
    if (!id) {
      return new Error({ message: 'Error while adding new county to DB' });
    }
    return id;
  }
  return countyData.id;
}

module.exports.getFormatedPrice = async function (gameId, countyCode) {
  try {
    const pricesCtrl = new PricesController();
    const prices = await pricesCtrl.getByGameId(gameId);

    let result = null;
    for (const price of prices || []) {
      if ((price.county_code ?? '').toLowerCase() === String(countyCode).toLowerCase()) {
        result = price;
        break;
      }
    }

    if (!result) {
      return new Error({ message: 'No price with given countyCode' });
    }

    return `${(result.price / 100).toFixed(2)} ${result.currency ?? ''}`;
  } catch (err) {
    throw err;
  }
};

module.exports.shouldSkipGameBecausePriceMissing = function (gameLike, sourceLabel, gameName) {
  const missingPrice = !hasPriceValue(gameLike?.cost);
  const hasFreeSignal = gameLike?.is_free != null || gameLike?.free != null;
  const free = isGameFree(gameLike);
  if (missingPrice && hasFreeSignal && !free) {
    console.log(`Skipping ${sourceLabel} game: missing price for non-free game`, {
      name: gameName ?? gameLike?.name ?? null,
      app_id: gameLike?.app_id ?? null,
      is_free: gameLike?.is_free ?? gameLike?.free ?? null,
      cost: gameLike?.cost ?? null,
    });
    return true;
  }
  return false;
}