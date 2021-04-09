import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { PriceVerifier } from "../typechain/PriceVerifier";
import { PriceFeed } from "../typechain/PriceFeed";
import { signPriceData } from "../utils/price-signer";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Wallet} from "ethers";

chai.use(solidity);
const { expect } = chai;

describe("Price feed", function() {

  const PRIV = "0xae2b81c1fe9e3b01f060362f03abd0c80a6447cfe00ff7fc7fcf000000000000";

  let owner: SignerWithAddress;
  let other: SignerWithAddress;
  let signer: Wallet;
  let verifier: PriceVerifier;
  let priceFeed: PriceFeed;
  let currentTime: number;

  it("Should deploy functions", async function() {
    [owner, other] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("PriceVerifier");

    signer = new ethers.Wallet(PRIV, owner.provider);
    verifier = (await Verifier.deploy()) as PriceVerifier;
  });


  it("Should not allow creating price feed with an empty verifier", async function() {
    const PriceFeed = await ethers.getContractFactory("PriceFeed");

    await expect(PriceFeed.deploy(ethers.constants.AddressZero, 5 * 60))
      .to.be.revertedWith('Cannot set an empty verifier');
  });


  it("Should not allow creating price feed with a delay shorter than 15s", async function() {
    const PriceFeed = await ethers.getContractFactory("PriceFeed");

    await expect(PriceFeed.deploy(verifier.address, 14))
      .to.be.revertedWith('Maximum price delay must be greater or equal to 15 seconds');
  });


  it("Should deploy a price feed", async function() {
    const PriceFeed = await ethers.getContractFactory("PriceFeed");

    priceFeed = await PriceFeed.deploy(verifier.address, 5 * 60) as PriceFeed;
    expect(priceFeed.address).not.to.equal(ethers.constants.AddressZero);
  });


  it("Should not allow setting the price without authorization", async function() {
    const Mock = await ethers.getContractFactory("MockDefi");
    let mock = await Mock.deploy(priceFeed.address);
    currentTime = await mock.getCurrentTime();

    let priceData = {
      symbols: ["ETH"].map(ethers.utils.formatBytes32String),
      prices: [1800],
      timestamp: currentTime,
      signer: signer.address
    };

    let signature = signPriceData(priceData, signer.privateKey);
    await expect(priceFeed.setPrices(priceData, signature))
      .to.be.revertedWith('Unauthorized price data signer');
  });


  it("Should not allow authorization from non owner", async function() {
      await expect(priceFeed.connect(other).authorizeSigner(signer.address))
        .to.be.revertedWith('Ownable: caller is not the owner');
  });


  it("Should authorize a signer", async function() {
    await priceFeed.authorizeSigner(signer.address);
  });


  it("Should not allow setting a price after delay", async function() {
    const Mock = await ethers.getContractFactory("MockDefi");
    let mock = await Mock.deploy(priceFeed.address);
    currentTime = await mock.getCurrentTime();


    let priceData = {
      symbols: ["ETH"].map(ethers.utils.formatBytes32String),
      prices: [1800],
      timestamp: currentTime - 301,
      signer: signer.address
    };

    let signature = signPriceData(priceData, signer.privateKey);
    await expect(priceFeed.setPrices(priceData, signature))
      .to.be.revertedWith('Price data timestamp too old');
  });


  it("Should set a single price", async function() {
    let priceData = {
      symbols: ["ETH"].map(ethers.utils.formatBytes32String),
      prices: [1800],
      timestamp: currentTime,
      signer: signer.address
    };

    let signature = signPriceData(priceData, signer.privateKey);
    await priceFeed.setPrices(priceData, signature);

    let contractPrice = await priceFeed.getPrice(priceData.symbols[0]);

    expect(contractPrice).to.be.equal(priceData.prices[0]);
  });


  it("Should throw for querying unavailable price", async function() {
    await expect(priceFeed.getPrice(ethers.utils.formatBytes32String("ETH2")))
      .to.be.revertedWith('No pricing data for given symbol');
  });


  it("Should not allow overwriting the price", async function() {
    let priceData = {
      symbols: ["ETH"].map(ethers.utils.formatBytes32String),
      prices: [1900],
      timestamp: currentTime,
      signer: signer.address
    };

    let signature = signPriceData(priceData, signer.privateKey);
    await expect(priceFeed.setPrices(priceData, signature))
      .to.be.revertedWith('Cannot overwrite existing price');
  });


  it("Should clear the single price", async function() {
    let priceData = {
      symbols: ["ETH"].map(ethers.utils.formatBytes32String),
      prices: [1900],
      timestamp: currentTime,
      signer: signer.address
    };

    await priceFeed.clearPrices(priceData);

    await expect(priceFeed.getPrice(priceData.symbols[0]))
      .to.be.revertedWith('No pricing data for given symbol');
  });


  it("Should revoke authorization", async function() {
      await priceFeed.revokeSigner(signer.address);

      let priceData = {
          symbols: ["ETH"].map(ethers.utils.formatBytes32String),
          prices: [1800],
          timestamp: currentTime,
          signer: signer.address
      };

      let signature = signPriceData(priceData, signer.privateKey);
      await expect(priceFeed.setPrices(priceData, signature))
          .to.be.revertedWith('Unauthorized price data signer');
  });


  //TODO: Add scenarios for multiple prices

});









