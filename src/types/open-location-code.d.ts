declare module "open-location-code" {
  interface CodeArea {
    latitudeLo: number;
    latitudeHi: number;
    longitudeLo: number;
    longitudeHi: number;
    latitudeCenter: number;
    longitudeCenter: number;
    codeLength: number;
  }

  class OpenLocationCode {
    isValid(code: string): boolean;
    isShort(code: string): boolean;
    isFull(code: string): boolean;
    encode(latitude: number, longitude: number, codeLength?: number): string;
    decode(code: string): CodeArea;
    recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string;
    shorten(code: string, latitude: number, longitude: number): string;
  }

  export { OpenLocationCode, CodeArea };
}
