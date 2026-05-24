import axios from 'axios';

class IPInfoService {
  constructor() {
    this.apiToken = process.env.IP_INFO_TOKEN || '9150a0245fbc83';
    this.baseURL = 'https://ipinfo.io';
  }

  async getIPInfo(ip4Address) {
    try {
      const url = `${this.baseURL}/${ip4Address}?token=${this.apiToken}`;
      
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'IPInfoService/1.0'
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error fetching IP info:', error.message);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  // Extraire les informations essentielles pour notre usage
  extractLocationInfo(ipInfoData) {
    if (!ipInfoData) return null;

    return {
      ip: ipInfoData.ip,
      countryCode: ipInfoData.country, // Code pays (ex: "MA", "FR")
      region: ipInfoData.region,
      city: ipInfoData.city,
      timezone: ipInfoData.timezone, // ex: "Africa/Casablanca"
      isp: ipInfoData.org, // ex: "AS36925 MEDITELECOM"
      postal: ipInfoData.postal,
      coordinates: ipInfoData.loc // format: "lat,lng"
    };
  }

  // Vérifier si le service est configuré
  isConfigured() {
    return !!this.apiToken;
  }

  // Méthode pour obtenir les informations complètes d'une IP
  async getLocationInfo(ipAddress) {
    try {
      if (!ipAddress) {
        console.warn('IP address is required');
        return null;
      }

      const result = await this.getIPInfo(ipAddress);
      
      if (!result.success) {
        console.error('Failed to get IP info:', result.error);
        return null;
      }

      return this.extractLocationInfo(result.data);
    } catch (error) {
      console.error('Error in getLocationInfo:', error);
      return null;
    }
  }
}

export default new IPInfoService(); 