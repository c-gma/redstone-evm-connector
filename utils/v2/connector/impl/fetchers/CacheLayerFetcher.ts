import axios from "axios";
import { Fetcher, SignedDataPackageResponse, SourceConfig } from "./Fetcher";

export class CacheLayerFetcher extends Fetcher {

  async getLatestData(): Promise<SignedDataPackageResponse> {
    const response = await axios.get(`${this.config.url!}/packages/latest`, {
      params: {
        asset: this.asset,
        provider: this.config.providerId!,
      },
    });
    return response.data;
  }
}