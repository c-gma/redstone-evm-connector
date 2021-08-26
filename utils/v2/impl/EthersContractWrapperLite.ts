import {Contract, Signer} from "ethers";
import {EthersContractWrapper} from "./EthersContractWrapper";
import {EthersContractWrapperLiteBuilder} from "./EthersContractWrapperLiteBuilder";
import EvmPriceSigner from "redstone-node/dist/src/signers/EvmPriceSigner";
import {bufferToHex, keccak256, toBuffer} from "ethereumjs-util";
import {personalSign} from "eth-sig-util";
import {MockPriceFeed} from "../connector/impl/MockPriceFeed";

export class EthersContractWrapperLite<T extends Contract> extends EthersContractWrapper<T> {

  private readonly priceSigner = new EvmPriceSigner();

  static wrapLite<T extends Contract>(contract: T): EthersContractWrapperLiteBuilder<T> {
    return new EthersContractWrapperLiteBuilder(contract);
  }

  protected getMarkerData(): string {
    return "";
  }

  protected async getPriceData(signer: Signer, asset?: string): Promise<string> {
    const {priceData, liteSignature} = await this.apiConnector.getSignedPrice();

    let data = this.priceSigner.getLiteDataBytesString(priceData);
    
    data += priceData.symbols.length.toString(8).padStart(2, "0")
      + liteSignature.substr(2);
    return data;
  }

}
