# Deep Link Payment Approach (Saved for Later)

## Current Implementation

### How it works:
1. User clicks "Subscribe" button
2. Bot generates TON deep link: `ton://transfer/ADDRESS?amount=AMOUNT&text=REFERENCE`
3. User clicks "Pay 1 TON" button
4. Opens external TON wallet app
5. User makes payment in external app
6. User manually clicks "Check Payment" button
7. Bot polls TON API to verify payment

### Code Location:
- `src/telegramBot.js` - `handleSubscribe()` method
- `src/services/paymentChecker.js` - Manual payment verification
- Deep link format: `ton://transfer/${config.TON_ADDRESS}?amount=${tonAmount}&text=${paymentReference}`

### Pros:
- Works with any TON wallet
- User has control over payment
- Can use any TON wallet app

### Cons:
- User leaves Telegram app
- Requires manual payment checking
- Complex payment verification process
- Poor user experience

### Files to restore if needed:
- `src/telegramBot.js` lines 221-250 (handleSubscribe method)
- `src/services/paymentChecker.js` (entire file)
- Button: `{ text: '💎 Pay 1 TON', url: tonUrl }`
- Button: `{ text: '🔍 Check Payment', callback_data: 'check_payment_${paymentReference}' }`

## Migration Notes:
- This approach can be restored if Telegram Payments API doesn't work
- All TON API integration code is preserved
- Manual payment checking logic is maintained
