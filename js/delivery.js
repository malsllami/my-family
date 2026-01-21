document.addEventListener("DOMContentLoaded", () => {
  const deliveryTrigger = document.querySelector("[data-action='delivery']");
  if (!deliveryTrigger) {
    return;
  }

  deliveryTrigger.addEventListener("click", handleDelivery);
});

function handleDelivery(event) {
  event.preventDefault();

  const main = document.getElementById("mainContent");
  if (!main) {
    console.error("mainContent container is missing");
    return;
  }

  main.replaceChildren(createDeliveryCard());
}

function createDeliveryCard() {
  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("h3");
  title.textContent = "التسليم";

  const text = document.createElement("p");
  text.textContent = "تم فتح واجهة التسليم";

  card.append(title, text);
  return card;
}
