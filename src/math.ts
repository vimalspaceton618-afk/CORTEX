export function computePrimes(max: number): number[] {
    if (max < 2) return [];
    // 2 and 3 are prime
    const primes: number[] = [2, 3];
    if (max < 3) {
        return max >= 2 ? [2] : [];
    }
    // Check numbers of the form 6k ± 1 up to max
    for (let k = 1; ; k++) {
        for (const offset of [1, -1]) {
            const candidate = 6 * k + offset;
            if (candidate > max) {
                return primes;
            }
            // Skip if candidate is less than 2 (not needed for k>=1, offset=-1 gives 5, but keep for safety)
            if (candidate < 2) continue;
            let isPrime = true;
            const limit = Math.sqrt(candidate);
            for (const p of primes) {
                if (p > limit) break;
                if (candidate % p === 0) {
                    isPrime = false;
                    break;
                }
            }
            if (isPrime) {
                primes.push(candidate);
            }
        }
    }
}