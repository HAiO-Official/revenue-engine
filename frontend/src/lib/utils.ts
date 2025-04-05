import { BN } from '@coral-xyz/anchor';

// 토큰 양 포맷팅 함수 (소수점 처리 개선)
export function formatTokenAmount(amount: bigint | BN | number | string, decimals: number, maxDecimals: number = 6): string {
    let bnAmount: BN;
    try {
        bnAmount = new BN(String(amount));
    } catch {
        return "N/A"; // 변환 실패 시
    }

    const factor = new BN(10).pow(new BN(decimals));
    const integerPart = bnAmount.div(factor);
    const fractionalPart = bnAmount.mod(factor);

    if (fractionalPart.isZero()) {
        return integerPart.toString();
    } else {
        let fractionalString = fractionalPart.toString().padStart(decimals, '0');
        // 뒤쪽 0 제거
        fractionalString = fractionalString.replace(/0+$/, '');
        // 최대 소수점 자리수 제한
        if (fractionalString.length > maxDecimals) {
            fractionalString = fractionalString.substring(0, maxDecimals);
        }
         // 만약 모든 소수점 이하가 0이었다면 빈 문자열이 될 수 있음
        return `${integerPart}.${fractionalString || '0'}`;
    }
}

// 콘솔 로그용 간단 포맷
export function logFormat(amount: bigint | BN | number | string, decimals: number): string {
    return formatTokenAmount(amount, decimals);
}
