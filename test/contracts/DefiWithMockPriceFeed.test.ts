import {ethers} from "hardhat";
import {Wallet} from "ethers";
import chai from "chai";
import {solidity} from "ethereum-waffle";
import {MockDefi} from "../../typechain/MockDefi";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {mockModule, syncTime} from "../_helpers";

import {PriceFeedWithClearing} from "../../typechain/PriceFeedWithClearing";
import * as MockProvider from "../../utils/mock-price-package";
import * as sinon from 'sinon';
import {MockConnector} from "../../utils/v2/connector/impl/MockConnector";
import {EthersContractWrapper} from "../../utils/v2/impl/EthersContractWrapper";

chai.use(solidity);

const {expect} = chai;

const toBytes32 = ethers.utils.formatBytes32String;
const serialized = function (x: number): number {
  return x * 10 ** 8;
};

describe("MockDefi with Proxy contract and mock pricing Data", function () {

  const PRIV = "0xae2b81c1fe9e3b01f060362f03abd0c80a6447cfe00ff7fc7fcf000000000000";

  let sandbox: sinon.SinonSandbox;

  const mockApiConnector = new MockConnector();

  const mockProvider = mockModule<typeof MockProvider>(MockProvider, {
    mockPricePackage: (forTime: number) => {
      return {
        prices: [
          {symbol: "ETH", value: 10},
          {symbol: "AVAX", value: 5}
        ],
        timestamp: forTime - 1000
      }
    }
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let defi: MockDefi;
  let priceFeed: PriceFeedWithClearing;
  let signer: Wallet;

  it("Deployment should have zero balance", async function () {
    [owner, admin] = await ethers.getSigners();

    const Defi = await ethers.getContractFactory("MockDefi");
    const Proxy = await ethers.getContractFactory("RedstoneUpgradeableProxy");
    const PriceFeedWithClearing = await ethers.getContractFactory("PriceFeedWithClearing");

    signer = new ethers.Wallet(PRIV, owner.provider);

    priceFeed = (await PriceFeedWithClearing.deploy()) as PriceFeedWithClearing;
    await priceFeed.authorizeSigner(signer.address);

    defi = (await Defi.deploy()) as MockDefi;

    const proxy = await Proxy.deploy(defi.address, priceFeed.address, admin.address, []);

    defi = (await Defi.attach(proxy.address)) as MockDefi;
    await defi.initialize(priceFeed.address);

    defi = defi.connect(signer);

    await owner.sendTransaction({to: signer.address, value: ethers.utils.parseEther("1")});

  });


  it("Should deposit - write no pricing info", async function () {

    defi = EthersContractWrapper
      .usingMockPriceFeed(defi)
      .wrap();

    await syncTime();
    await defi.deposit(toBytes32("ETH"), 100);
    await defi.deposit(toBytes32("AVAX"), 50);

  });


  it("Should check balance - read no pricing info", async function () {
    await syncTime();
    expect(await defi.balanceOf(signer.address, toBytes32("ETH"))).to.be.equal(100);
    expect(await defi.balanceOf(signer.address, toBytes32("AVAX"))).to.be.equal(50);
  });


  it("Should check value - read with pricing info", async function () {

    mockProvider(sandbox, {
      mockPricePackage: (forTime: number) => {
        console.log("HELLO WORLD FROM MOCK OVERRIDDEN 1");
        return {
          prices: [
            {symbol: "ETH", value: 200},
            {symbol: "AVAX", value: 4}
          ],
          timestamp: forTime - 1000
        }
      },
    });

    await syncTime();

    expect(await defi.currentValueOf(signer.address, toBytes32("ETH"))).to.be.equal(serialized(100 * 200));
    expect(await defi.currentValueOf(signer.address, toBytes32("AVAX"))).to.be.equal(serialized(50 * 4));
  });

  it("Should check value - read with different pricing info", async function () {
    mockProvider(sandbox, {
      mockPricePackage: (forTime: number) => {
        console.log("HELLO WORLD FROM MOCK OVERRIDDEN 2");
        return {
          prices: [
            {symbol: "ETH", value: 400},
            {symbol: "AVAX", value: 8}
          ],
          timestamp: forTime - 1000
        }
      },
    });

    await syncTime();

    expect(await defi.currentValueOf(signer.address, toBytes32("ETH"))).to.be.equal(serialized(100 * 400));
    expect(await defi.currentValueOf(signer.address, toBytes32("AVAX"))).to.be.equal(serialized(50 * 8));
  });


  it("Should swap - write with pricing info", async function () {

    await syncTime();
    let tx = await defi.swap(toBytes32("ETH"), toBytes32("AVAX"), 10);
    expect(tx).is.not.undefined;

    expect(await defi.balanceOf(signer.address, toBytes32("ETH"))).to.be.equal(90);
    expect(await defi.balanceOf(signer.address, toBytes32("AVAX"))).to.be.equal(70);

  });

});
