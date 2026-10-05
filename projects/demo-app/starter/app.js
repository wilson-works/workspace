// Tip splitter. splitBill() holds all the math and touches nothing else, so
// tests can load it in Node. The page wiring at the bottom only runs in a browser.

function roundCents(amount) {
  return Math.round(amount * 100) / 100;
}

// Returns { tip, total, each } in dollars, each rounded to the nearest cent.
// Throws an Error with a plain message when an input makes no sense.
function splitBill(bill, tipPct, people) {
  if (!Number.isFinite(bill) || bill < 0) {
    throw new Error('Enter a bill amount of 0 or more.');
  }
  if (!Number.isFinite(tipPct) || tipPct < 0) {
    throw new Error('Enter a tip of 0% or more.');
  }
  if (!Number.isInteger(people) || people < 1) {
    throw new Error('Enter a whole number of people, 1 or more.');
  }

  const tip = bill * tipPct / 100;
  const total = bill + tip;
  const each = bill / people + tip;

  return { tip: roundCents(tip), total: roundCents(total), each: roundCents(each) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { splitBill };
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('split-form');
  const result = document.getElementById('result');
  const money = (amount) => '$' + amount.toFixed(2);

  const update = () => {
    try {
      const r = splitBill(
        Number(form.elements.bill.value),
        Number(form.elements.tip.value),
        Number(form.elements.people.value)
      );
      result.textContent = `Total with tip: ${money(r.total)}. Each person pays ${money(r.each)}.`;
    } catch (err) {
      result.textContent = err.message;
    }
  };

  form.addEventListener('input', update);
  form.addEventListener('submit', (event) => event.preventDefault());
  update();
}
