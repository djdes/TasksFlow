import { TuyaContext } from "@tuya/tuya-connector-nodejs";

const tuyaClient = new TuyaContext({
  baseUrl: process.env.TUYA_BASE_URL || "https://openapi.tuyaeu.com",
  accessKey: process.env.TUYA_ACCESS_ID || "",
  secretKey: process.env.TUYA_ACCESS_SECRET || "",
});

interface TuyaDeviceStatus {
  code: string;
  value: number | string | boolean;
}

interface TuyaTemperatureResult {
  temperature: number;
  humidity: number | null;
  raw: TuyaDeviceStatus[];
}

export async function getDeviceTemperature(
  deviceId: string
): Promise<TuyaTemperatureResult> {
  const res = await tuyaClient.request({
    path: `/v1.0/devices/${deviceId}/status`,
    method: "GET",
  });

  if (!res.success) {
    throw new Error(`Tuya API error: ${res.msg} (code: ${res.code})`);
  }

  const statuses = res.result as TuyaDeviceStatus[];

  const tempStatus = statuses.find(
    (s) => s.code === "va_temperature" || s.code === "temp_current"
  );
  const humStatus = statuses.find(
    (s) => s.code === "va_humidity" || s.code === "humidity_value"
  );

  if (!tempStatus) {
    throw new Error(
      `No temperature data from device ${deviceId}. Statuses: ${JSON.stringify(statuses)}`
    );
  }

  // Tuya reports values multiplied by 10 (e.g., 199 = 19.9°C)
  const temperature = Number(tempStatus.value) / 10;
  const humidity = humStatus ? Number(humStatus.value) / 10 : null;

  return { temperature, humidity, raw: statuses };
}

export async function getDeviceInfo(deviceId: string) {
  const res = await tuyaClient.request({
    path: `/v1.0/devices/${deviceId}`,
    method: "GET",
  });

  if (!res.success) {
    throw new Error(`Tuya API error: ${res.msg} (code: ${res.code})`);
  }

  return res.result;
}
