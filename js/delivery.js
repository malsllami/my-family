
document.addEventListener("DOMContentLoaded", function () {
  const buttons = document.querySelectorAll("button, a");
  let deliveryBtn = null;

  buttons.forEach(b => {
    if (b.textContent.includes("التسليم")) {
      deliveryBtn = b;
    }
  });

  if (!deliveryBtn) {
    console.error("Delivery button not found");
    return;
  }

  deliveryBtn.addEventListener("click", function () {
    loadDelivery();
  });
});

function loadDelivery() {
  const main = document.getElementById("mainContent") || document.body;
  main.innerHTML = `
    <div class="card">
      <h3>التسليم</h3>
      <p>تم فتح واجهة التسليم</p>
    </div>
  `;
}
