export const getNextBid = (currentBid: number) => {
  if (currentBid < 10000000) { // < 1 Cr
    return currentBid + 500000; // + 5 L
  }
  if (currentBid < 20000000) { // 1 Cr - 2 Cr
    return currentBid + 1000000; // + 10 L
  }
  if (currentBid < 50000000) { // 2 Cr - 5 Cr
    return currentBid + 2000000; // + 20 L
  }
  return currentBid + 2500000; // > 5 Cr -> + 25 L
};
