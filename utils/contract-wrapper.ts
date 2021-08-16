import { ethers, Signer } from "ethers";
import { PriceFeedWithClearing__factory } from "../typechain/factories/PriceFeedWithClearing__factory";
import { personalSign } from "eth-sig-util";
import { toBuffer, keccakFromString, keccak256, bufferToHex } from "ethereumjs-util";

// TODO: Refactor this file and add many comments to make it more clear

const { getSignedPrice } = require("../utils/api-connector");

export type PriceDataType = {
    symbols: string[],
    values: number[],
    timestamp: number
};

export type SignedPriceDataType = {
    priceData: PriceDataType,
    signer: string,
    signature: string
};

async function getPriceData(signer: Signer, dataProvider: string, asset?: string) {
    let { priceData, signature } = await getSignedPrice(dataProvider, asset);

    let priceFeed = PriceFeedWithClearing__factory.connect(ethers.constants.AddressZero, signer);
    let setPriceTx = await priceFeed.populateTransaction.setPrices(priceData, signature);
    
    const setPriceData = remove0xFromHexString(setPriceTx.data, {
      allowFalsyValues: true,
    });

    let clearPriceTx = await priceFeed.populateTransaction.clearPrices(priceData); // priceData may have any value, we don't use it
    let clearPricePrefix = clearPriceTx.data ? clearPriceTx.data.substr(2,8) : ""; // We skip two first characters ("0x") and get 8 next (4 bytes of signature encoded as HEX)

    // Add priceDataLen info
    const priceDataLen = countBytesInHexString(setPriceData);

    // Template of data that we add to the end of tx is below
    // [SIG_CLEAR|4][SIG_SET|4][DATA|...][DATA_LEN|2][MARKER|32]
    // - SIG_CLEAR (4 bytes) - signature of clearPrices method of PriceFeed contract
    // - SIG_SET (4 bytes) - signature of setPrices method of PriceFeed contract
    // - DATA (variable bytes size) - pricing data
    // - DATA_LEN (2 bytes) - pricing data size (in bytes)
    // - MARKER (32 bytes) - redstone marker
    return clearPricePrefix + setPriceData + priceDataLen.toString(16).padStart(4, "0"); // padStart helps to always have 2 bytes length for any number
}

async function getPriceDataLite(signer: Signer, dataProvider: string, asset?: string) {
    let { priceData } = await getSignedPrice(dataProvider, asset);

    const PRIV = "0xae2b81c1fe9e3b01f060362f03abd0c80a6447cfe00ff7fc7fcf000000000000";
    
    let data = "";
    for(var i=0; i<priceData.symbols.length; i++) {
        data += priceData.symbols[i].substr(2) + priceData.values[i].toString(16).padStart(64, "0");
    }

    data += Math.ceil(priceData.timestamp / 1000).toString(16).padStart(64, "0");         
    
    console.log("Raw data");
    console.log(data);
    const hash = bufferToHex(keccak256(toBuffer("0x" + data)));

    console.log("Hash: " + hash);
    let signature = personalSign(toBuffer(PRIV), {data: hash});
    console.log("Signature: " + signature);
    
    
    data += priceData.symbols.length.toString(8).padStart(2, "0")
            + signature.substr(2);

    return data; 
}

export function wrapContract(contract: any, dataProvider: string = "MOCK", asset?: string) {

  const wrappedContract = {...contract};

  const functionNames:string[] = Object.keys(contract.functions);
    functionNames.forEach(functionName => {
    if (functionName.indexOf("(") == -1) {
      const isCall = contract.interface.getFunction(functionName).constant;
      wrappedContract[functionName] = async function(...args: any[]) {

        const tx = await contract.populateTransaction[functionName](...args);

        // Here we append price data (currently with function signatures) to trasnation data
        tx.data = tx.data + (await getPriceData(contract.signer, dataProvider, asset)) + getMarkerData();

        if (isCall) {
            const result = await contract.signer.call(tx);
            const decoded =  contract.interface.decodeFunctionResult(functionName, result);
            return decoded.length == 1 ? decoded[0] : decoded;
        } else {
            return await contract.signer.sendTransaction(tx);
        }
      };
    }
  });

  return wrappedContract;
}

export function wrapContractLite(contract: any, dataProvider: string = "MOCK", asset?: string) {

    const wrappedContract = {...contract};

    const functionNames:string[] = Object.keys(contract.functions);
    functionNames.forEach(functionName => {
        if (functionName.indexOf("(") == -1) {
            const isCall = contract.interface.getFunction(functionName).constant;
            wrappedContract[functionName] = async function(...args: any[]) {

                const tx = await contract.populateTransaction[functionName](...args);

                // Here we append price data (currently with function signatures) to trasnation data
                tx.data = tx.data + (await getPriceDataLite(contract.signer, dataProvider, asset));

                if (isCall) {
                    const result = await contract.signer.call(tx);
                    const decoded =  contract.interface.decodeFunctionResult(functionName, result);
                    return decoded.length == 1 ? decoded[0] : decoded;
                } else {
                    return await contract.signer.sendTransaction(tx);
                }
            };
        }
    });

    return wrappedContract;
}

function getMarkerData() {
  const marker = ethers.utils.id("Redstone.version.0.0.1");
  return remove0xFromHexString(marker);
}

// Note: this function assumes that hexString doesn't start with 0x
function countBytesInHexString(hexStringWithout0x: string) {
  // 2 hex chars (0-f) represent a single byte
  return hexStringWithout0x.length / 2;
}

function remove0xFromHexString(hexString?: string, opts?: {
  allowFalsyValues: boolean;
}) {
  if (!hexString) {
    if (opts?.allowFalsyValues) {
      return "";
    } else {
      throw new Error("Falsy values are not allowed");
    }
  }

  if (!hexString.toLowerCase().startsWith("0x")) {
    throw new Error(`Hex string must start from 0x: ${hexString}`);
  }

  return hexString.substr(2);
}
