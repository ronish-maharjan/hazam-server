import crypto from 'node:crypto';
import { env } from '../config/env';

// ─── Types ────────────────────────────────────────────────

export interface EsewaSuccessResponse {
  transaction_code: string;
  status: string;
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
  signed_field_names: string;
  signature: string;
}

export interface EsewaStatusCheckResponse {
  status: string;
  ref_id?: string;
}

export interface EsewaFormData {
  amount: string;
  tax_amount: string;
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
  product_service_charge: string;
  product_delivery_charge: string;
  success_url: string;
  failure_url: string;
  signed_field_names: string;
  signature: string;
}

// ─── Generate eSewa Signature ─────────────────────────────

export function generateEsewaSignature(
  fields: Record<string, string>,
  signedFieldNames: string[],
): string {
  const message = signedFieldNames
    .map((field) => `${field}=${fields[field]}`)
    .join(',');

  return crypto
    .createHmac('sha256', env.ESEWA_SECRET_KEY)
    .update(message)
    .digest('base64');
}

// ─── Build Payment Form Data ──────────────────────────────

export function buildEsewaPaymentFormData(params: {
  amount: string;
  transactionUuid: string;
  successUrl: string;
  failureUrl: string;
}): EsewaFormData {
  const signedFields: Record<string, string> = {
    total_amount: params.amount,
    transaction_uuid: params.transactionUuid,
    product_code: env.ESEWA_MERCHANT_CODE,
  };

  const signedFieldNames = Object.keys(signedFields);
  const signature = generateEsewaSignature(signedFields, signedFieldNames);

  return {
    amount: params.amount,
    tax_amount: '0',
    total_amount: params.amount,
    transaction_uuid: params.transactionUuid,
    product_code: env.ESEWA_MERCHANT_CODE,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: params.successUrl,
    failure_url: params.failureUrl,
    signed_field_names: signedFieldNames.join(','),
    signature,
  };
}

// ─── Decode eSewa Success Response ────────────────────────

export function decodeEsewaResponse(encodedData: string): EsewaSuccessResponse {
  const decoded = Buffer.from(encodedData, 'base64').toString('utf-8');
  return JSON.parse(decoded) as EsewaSuccessResponse;
}

// ─── Verify eSewa Response Signature ──────────────────────

export function verifyEsewaSignature(
  responseData: EsewaSuccessResponse,
): boolean {
  const signedFieldNames = responseData.signed_field_names.split(',');

  const message = signedFieldNames
    .map((field) => {
      const value = responseData[field as keyof EsewaSuccessResponse];
      return `${field}=${String(value)}`;
    })
    .join(',');

  const expectedSignature = crypto
    .createHmac('sha256', env.ESEWA_SECRET_KEY)
    .update(message)
    .digest('base64');

  return expectedSignature === responseData.signature;
}

// ─── Generate Transaction UUID ────────────────────────────

export function generateTransactionUuid(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(3).toString('hex');
  return `HAZ-${timestamp}-${random}`;
}

// ─── Server-to-Server Status Check ────────────────────────

export async function verifyEsewaTransactionStatus(params: {
  transactionUuid: string;
  totalAmount: string;
  productCode: string;
}): Promise<EsewaStatusCheckResponse> {
  const url = new URL(env.ESEWA_STATUS_API);
  url.searchParams.set('product_code', params.productCode);
  url.searchParams.set('total_amount', params.totalAmount);
  url.searchParams.set('transaction_uuid', params.transactionUuid);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `eSewa status check failed with HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as EsewaStatusCheckResponse;

  return data;
}
