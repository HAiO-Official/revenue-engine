import { BN } from '@coral-xyz/anchor';

// Token amount formatting function (improved decimal handling)
export function formatTokenAmount(amount: bigint | BN | number | string, decimals: number, maxDecimals: number = 6): string {
    let bnAmount: BN;
    try {
        bnAmount = new BN(String(amount));
    } catch {
        return "N/A"; // On conversion failure
    }

    const factor = new BN(10).pow(new BN(decimals));
    const integerPart = bnAmount.div(factor);
    const fractionalPart = bnAmount.mod(factor);

    if (fractionalPart.isZero()) {
        return integerPart.toString();
    } else {
        let fractionalString = fractionalPart.toString().padStart(decimals, '0');
        // Remove trailing zeros
        fractionalString = fractionalString.replace(/0+$/, '');
        // Limit maximum decimal places
        if (fractionalString.length > maxDecimals) {
            fractionalString = fractionalString.substring(0, maxDecimals);
        }
         // If all decimal places were 0, it could become an empty string
        return `${integerPart}.${fractionalString || '0'}`;
    }
}

// Simple format for console logs
export function logFormat(amount: bigint | BN | number | string, decimals: number): string {
    return formatTokenAmount(amount, decimals);
}
