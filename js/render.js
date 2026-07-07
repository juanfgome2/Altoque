import { el, emptyState } from "./dom.js";
import { formatDate, formatMoney, statusLabels } from "./format.js";
import { state } from "./state.js";

const roleLabels = {
  cliente: "Cliente",
  delivery: "Delivery",
  admin: "Administrador"
};

const panels = {
  cliente: [
    { id: "client", label: "Pedidos" },
    { id: "stores", label: "Comercios" },
    { id: "chat", label: "Chat" }
  ],
  delivery: [
    { id: "delivery", label: "Pedidos" },
    { id: "stores", label: "Comercios" },
    { id: "chat", label: "Chat" }
  ],
  admin: [
    { id: "admin", label: "Administración" },
    { id: "subscriptions", label: "Suscripciones" },
    { id: "stores", label: "Comercios" },
    { id: "chat", label: "Chat" }
  ]
};
const orderTabState = {
  client: "active",
  delivery: "available",
  admin: "active",
};

const paymentMethodLabels = {
  cash: "Efectivo",
  transfer: "Transferencia",
  mercadopago: "Mercado Pago"
};

let deliveryOrderCache = [];
let deliveryTabInitialized = false;

export function renderLoadingView() {
  el.loadingView.classList.remove("hidden");
  el.landingView.classList.add("hidden");
  el.authView.classList.add("hidden");
  el.dashboardView.classList.add("hidden");
  el.mainNav.classList.add("hidden");
  el.logoutBtn.classList.add("hidden");
  el.sessionBadge.classList.add("hidden");
}
export function renderPublicView(route) {
  el.loadingView.classList.add("hidden");
  el.landingView.classList.toggle("hidden", route !== "landing");
  el.authView.classList.toggle("hidden", route !== "login" && route !== "register");
  el.dashboardView.classList.add("hidden");
  el.mainNav.classList.add("hidden");
  el.logoutBtn.classList.add("hidden");
  el.sessionBadge.classList.add("hidden");

  const isRegister = route === "register";
  el.loginForm.classList.toggle("hidden", isRegister);
  el.registerForm.classList.toggle("hidden", !isRegister);
  el.authEyebrow.textContent = isRegister ? "Registro" : "Acceso";
  el.authTitle.textContent = isRegister ? "Crear cuenta" : "Iniciar sesión";
}

export function renderDashboard(profile, activePanel) {
  el.loadingView.classList.add("hidden");
  el.landingView.classList.add("hidden");
  el.authView.classList.add("hidden");
  el.dashboardView.classList.remove("hidden");
  el.mainNav.classList.remove("hidden");
  el.logoutBtn.classList.remove("hidden");
  el.sessionBadge.classList.remove("hidden");
  el.sessionBadge.textContent = `${roleLabels[profile.role]} · ${profile.name}`;

  renderProfileCard(profile);
  renderNavigation(profile, activePanel);
  el.clientRankingSidebar.classList.toggle("hidden", profile.role !== "cliente");
  renderPanel(activePanel);
  renderClientNotificationState(profile);
  renderDeliveryNotice(profile);
}

function renderProfileCard(profile) {
  el.profileCard.classList.remove("hidden");
  el.profileAvatar.innerHTML = avatarContent(profile);
  el.profileName.textContent = profile.name || "Usuario";
  el.profileRole.textContent = roleLabels[profile.role] || profile.role || "Perfil";
  el.deleteProfilePhotoBtn.classList.toggle("hidden", !profile.photoURL);
}

export function renderNavigation(profile, activePanel) {
  const items = panels[profile.role] || panels.cliente;
  el.mainNav.innerHTML = "";
  el.sideNav.innerHTML = "";

  items.forEach((item) => {
    const mainButton = navButton(item, activePanel, "nav-button");
    const sideButton = navButton(item, activePanel, "side-button");
    el.mainNav.appendChild(mainButton);
    el.sideNav.appendChild(sideButton);
  });
  updateChatIndicators();
}

export function renderPanel(panel) {
  el.clientPanel.classList.toggle("hidden", panel !== "client");
  el.deliveryPanel.classList.toggle("hidden", panel !== "delivery");
  el.chatPanel.classList.toggle("hidden", panel !== "chat");
  el.storesPanel.classList.toggle("hidden", panel !== "stores");
  el.adminPanel.classList.toggle("hidden", panel !== "admin" && panel !== "subscriptions");

  const title = {
    client: "Pedidos",
    delivery: "Pedidos",
    chat: "Chat",
    stores: "Comercios",
    admin: "Administración",
    subscriptions: "Suscripciones"
  }[panel] || "Inicio";
  el.panelTitle.textContent = title;

  if (panel === "subscriptions") {
    document.getElementById("subscriptionsAdminSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}


function renderClientStatusNotice(profile) {
  if (!el.clientStatusNotice) return;
  const status = profile.clientStatus || "active";
  const isClient = profile.role === "cliente";
  const isPendingPayment = isClient && status === "pending_payment";
  const isBlocked = isClient && status === "blocked";
  const shouldShow = isPendingPayment || isBlocked;

  el.clientStatusNotice.classList.toggle("hidden", !shouldShow);
  if (isPendingPayment) {
    el.clientStatusNotice.innerHTML = `
      <strong>🔒 Tu cuenta aún no está habilitada.</strong><br />
      Para comenzar a utilizar ALTOQUE debés comunicarte con el administrador y realizar el pago correspondiente.<br />
      Una vez confirmado el pago, tu cuenta será activada y podrás comenzar a crear pedidos.
    `;
  } else if (isBlocked) {
    el.clientStatusNotice.textContent = "Tu cuenta no está habilitada para crear pedidos. Comunicate con el administrador.";
  }

  if (el.clientStatusWhatsappBtn) {
    el.clientStatusWhatsappBtn.classList.toggle("hidden", !isPendingPayment);
  }
}
function renderClientNotificationState(profile) {
  if (!el.clientNotificationsBtn) return;
  const isClient = profile.role === "cliente";
  el.clientNotificationsBtn.classList.toggle("hidden", !isClient);
  if (!isClient) return;
  el.clientNotificationsBtn.textContent = profile.fcmToken
    ? "Notificaciones activadas"
    : "Activar notificaciones";
}
export function renderDeliveryNotice(profile) {
  if (profile.role !== "delivery") return;

  const approved = profile.status === "active" && !profile.suspended;
  const subscription = getDeliverySubscriptionState(profile);
  const canWork = approved && subscription.canWork;
  const totalRatings = Number(profile.totalRatings || 0);
  const averageRating = Number(profile.averageRating || 0);
  el.deliveryApprovalNotice.classList.toggle("hidden", approved);
  el.deliveryApprovalNotice.textContent = "Tu cuenta de delivery está pendiente de aprobación. Podés iniciar sesión, pero no aceptar pedidos todavía.";
  el.deliverySubscriptionNotice.classList.toggle("hidden", !subscription.showNotice);
  el.deliverySubscriptionMessage.textContent = subscription.message;
  el.availabilityBtn.disabled = !canWork;
  el.availabilityBtn.textContent = profile.available ? "Desactivar disponibilidad" : "Activar disponibilidad";
  el.notificationsBtn.disabled = !approved;
  el.notificationsBtn.textContent = typeof Notification !== "undefined" && Notification.permission === "granted"
    ? "Notificaciones activadas"
    : "Activar notificaciones";
  el.deliveryReputation.textContent = totalRatings
    ? `⭐ ${averageRating.toFixed(1)} · ${totalRatings} ${totalRatings === 1 ? "calificación" : "calificaciones"}`
    : "⭐ Sin calificaciones todavía";
}

function getDeliverySubscriptionState(profile) {
  const inactiveMessage = "Tu suscripción no está activa. Para volver a recibir pedidos, comunicate con el administrador.";

  if (!profile.subscriptionPlanId || !profile.subscriptionExpiresAt) {
    return { canWork: false, showNotice: true, message: inactiveMessage };
  }

  const expiresAt = toDate(profile.subscriptionExpiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

  if (expiresAt < now) {
    return { canWork: false, showNotice: true, message: inactiveMessage };
  }

  if (daysLeft <= 7) {
    return {
      canWork: true,
      showNotice: true,
      message: `Tu suscripción vence en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}. Si querés renovarla, comunicate con el administrador.`
    };
  }

  return { canWork: true, showNotice: false, message: "" };
}

export function renderClientOrders(orders = [], handlers) {
  const inProgress = orders.filter(isActiveOrder);
  const history = orders.filter(isHistoryOrder);
  const tabs = {
    active: {
      orders: inProgress,
      emptyText: "No tenés pedidos en curso."
    },
    history: {
      orders: history,
      emptyText: "Todavía no hay historial."
    }
  };

  orderTabState.client = tabs[orderTabState.client] ? orderTabState.client : "active";
  bindOrderTabs("client", () => renderClientOrders(orders, handlers));
  updateOrderTabs("client", orderTabState.client);
  const current = tabs[orderTabState.client] || tabs.active;
  renderOrderList(el.clientTabbedOrders, current.orders, current.emptyText, "cliente", handlers);
  el.clientActiveCount.textContent = inProgress.length;
  el.clientHistoryCount.textContent = history.length;
}

export function renderDeliveryRanking(users) {
  const deliveries = users
    .filter((user) => user.status === "active" && !user.suspended && Number(user.totalRatings || 0) >= 5)
    .sort((first, second) => {
      const ratingDifference = Number(second.averageRating || 0) - Number(first.averageRating || 0);
      return ratingDifference || Number(second.totalRatings || 0) - Number(first.totalRatings || 0);
    });

  el.deliveryRanking.innerHTML = "";
  if (!deliveries.length) {
    el.deliveryRanking.appendChild(emptyState("Todavía no hay deliveries con 5 calificaciones."));
    return;
  }

  deliveries.forEach((delivery, index) => {
    const card = document.createElement("article");
    const position = index + 1;
    const medals = ["🥇", "🥈", "🥉"];
    const podiumClass = position <= 3 ? ` ranking-place-${position}` : "";
    card.className = `delivery-ranking-card${podiumClass}`;
    card.innerHTML = `
      <span class="ranking-position">${medals[index] || `#${position}`}</span>
      ${avatarMarkup(delivery, "avatar-sm")}
      <div class="ranking-delivery-details">
        <strong>${escapeText(delivery.name || "Delivery")}</strong>
        <span class="ranking-rating">⭐ ${Number(delivery.averageRating || 0).toFixed(1)}</span>
        <small>${delivery.totalRatings} calificaciones</small>
      </div>
    `;
    el.deliveryRanking.appendChild(card);
  });
}

export function renderAvailableOrders(orders = [], handlers, canAccept) {
  deliveryOrderCache.available = orders.filter(isAvailableOrder);
  deliveryOrderCache.handlers = handlers;
  deliveryOrderCache.canAccept = canAccept;
  renderDeliveryOrderTabs();
}

export function renderDeliveryOrders(orders = [], handlers) {
  deliveryOrderCache.mine = orders;
  deliveryOrderCache.handlers = handlers;
  renderDeliveryOrderTabs();
}

export function selectDeliveryOrderTab(tab) {
  orderTabState.delivery = tab;
  deliveryTabInitialized = true;
  renderDeliveryOrders(deliveryOrderCache.mine || [], deliveryOrderCache.handlers);
}

function normalizeOrderStatus(status) {
  return String(status || "new")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function isAvailableOrder(order) {
  return ["new", "nuevo", "pending", "pendiente", "created", "creado", "open", "abierto", "available", "disponible"].includes(normalizeOrderStatus(order.status));
}

function isDeliveryInProgressOrder(order) {
  return ["accepted", "aceptado", "assigned", "asignado", "taken", "tomado", "in_progress", "en_progreso", "en_camino", "on_the_way", "ongoing", "activo"].includes(normalizeOrderStatus(order.status));
}

function isCompletedOrder(order) {
  return ["completed", "completado", "complete", "done", "finalizado", "finished", "delivered", "entregado"].includes(normalizeOrderStatus(order.status));
}

function isCancelledOrder(order) {
  return ["cancelled", "canceled", "cancelado", "cancelada", "rejected", "rechazado", "anulado"].includes(normalizeOrderStatus(order.status));
}

function isHistoryOrder(order) {
  return isCompletedOrder(order) || isCancelledOrder(order);
}

function isActiveOrder(order) {
  return !isHistoryOrder(order);
}
function renderDeliveryOrderTabs() {
  if (!el.deliveryTabbedOrders || !deliveryOrderCache.handlers) return;

  const available = (deliveryOrderCache.available || []).filter(isAvailableOrder);
  const inProgress = (deliveryOrderCache.mine || []).filter(isDeliveryInProgressOrder);
  const history = (deliveryOrderCache.mine || []).filter(isHistoryOrder);
  const tabs = {
    available: {
      orders: available,
      emptyText: "No hay pedidos disponibles ahora.",
      context: "delivery",
      options: { canAccept: deliveryOrderCache.canAccept }
    },
    active: {
      orders: inProgress,
      emptyText: "No tenés pedidos en curso.",
      context: "deliveryMine",
      options: {}
    },
    history: {
      orders: history,
      emptyText: "Todavía no hay historial.",
      context: "deliveryMine",
      options: {}
    }
  };

  if (!deliveryTabInitialized) {
    orderTabState.delivery = inProgress.length ? "active" : "available";
    deliveryTabInitialized = true;
  } else {
    orderTabState.delivery = tabs[orderTabState.delivery] ? orderTabState.delivery : "available";
  }

  bindDeliveryOrderTabs();
  updateOrderTabs("delivery", orderTabState.delivery);
  const current = tabs[orderTabState.delivery] || tabs.available;
  renderOrderList(el.deliveryTabbedOrders, current.orders, current.emptyText, current.context, deliveryOrderCache.handlers, current.options);
  el.availableCount.textContent = available.length;
  el.deliveryInProgressCount.textContent = inProgress.length;
  el.deliveryMineCount.textContent = history.length;
}

function bindDeliveryOrderTabs() {
  if (el.deliveryAvailableTab) {
    el.deliveryAvailableTab.onclick = (event) => {
      event.preventDefault();
      orderTabState.delivery = "available";
      deliveryTabInitialized = true;
      renderDeliveryOrders(deliveryOrderCache.mine || [], deliveryOrderCache.handlers);
    };
  }

  if (el.deliveryInProgressTab) {
    el.deliveryInProgressTab.onclick = (event) => {
      event.preventDefault();
      orderTabState.delivery = "active";
      deliveryTabInitialized = true;
      renderDeliveryOrders(deliveryOrderCache.mine || [], deliveryOrderCache.handlers);
    };
  }

  if (el.deliveryHistoryTab) {
    el.deliveryHistoryTab.onclick = (event) => {
      event.preventDefault();
      orderTabState.delivery = "history";
      deliveryTabInitialized = true;
      renderDeliveryOrders(deliveryOrderCache.mine || [], deliveryOrderCache.handlers);
    };
  }
}

function bindOrderTabs(group, renderCallback) {
  document.querySelectorAll(`[data-order-tab^="${group}-"]`).forEach((button) => {
    button.onclick = () => {
      orderTabState[group] = getOrderTabKey(group, button.dataset.orderTab);
      renderCallback();
    };
  });
}

function updateOrderTabs(group, activeTab) {
  const activeDomTab = getOrderTabDomId(group, activeTab);
  document.querySelectorAll(`[data-order-tab^="${group}-"]`).forEach((button) => {
    const isActive = button.dataset.orderTab === activeDomTab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function getOrderTabKey(group, domTab) {
  const normalized = String(domTab || "").replace(`${group}-`, "");
  if (normalized === "in-progress") return "active";
  return normalized;
}

function getOrderTabDomId(group, key) {
  const domKey = key === "active" && group !== "admin" ? "in-progress" : key;
  return `${group}-${domKey}`;
}
export function renderChatOrders(orders, activeOrderId, handler) {
  el.chatList.innerHTML = "";
  if (!orders.length) {
    el.chatList.appendChild(emptyState("No hay conversaciones disponibles."));
    updateChatIndicators();
    return;
  }

  orders.forEach((order) => {
    const button = document.createElement("button");
    const hasUnread = state.unreadChatOrderIds.includes(order.id);
    button.className = `chat-item ${order.id === activeOrderId ? "active" : ""} ${hasUnread ? "unread" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <strong>${hasUnread ? "● " : ""}${escapeText(order.category)} · ${escapeText(statusLabels[order.status] || order.status)}</strong>
      <span>${escapeText(order.lastMessageText || order.description)}</span>
    `;
    button.addEventListener("click", () => handler(order));
    el.chatList.appendChild(button);
  });
  updateChatIndicators();
}

export function renderMessages(messages) {
  el.messagesList.innerHTML = "";
  if (!messages.length) {
    el.messagesList.appendChild(emptyState("Todavía no hay mensajes. Escribí el primero."));
    return;
  }

  messages.forEach((message) => {
    const senderProfile = getUserProfile(message.senderId) || {
      name: message.senderName,
      photoURL: ""
    };
    const item = document.createElement("div");
    item.className = `message ${message.senderId === state.profile?.id ? "self" : ""}`;
    item.innerHTML = `
      ${avatarMarkup(senderProfile, "avatar-sm message-avatar")}
      <div class="message-content">
        <div>${escapeText(message.text)}</div>
        <small>${escapeText(message.senderName || senderProfile.name || "Usuario")} · ${formatDate(message.createdAt)}</small>
      </div>
    `;
    el.messagesList.appendChild(item);
  });
  el.messagesList.scrollTop = el.messagesList.scrollHeight;
}

export function renderAdminUsers(users, handlers) {
  el.adminUsers.innerHTML = "";
  el.pendingDeliveries.innerHTML = "";
  const pending = users.filter((user) => user.role === "delivery" && user.status === "pending");

  if (!users.length) el.adminUsers.appendChild(emptyState("No hay usuarios registrados."));
  users.forEach((user) => el.adminUsers.appendChild(userCard(user, handlers)));

  if (!pending.length) el.pendingDeliveries.appendChild(emptyState("No hay deliverys pendientes."));
  pending.forEach((user) => el.pendingDeliveries.appendChild(userCard(user, handlers, true)));

  el.adminUserCount.textContent = users.length;
  el.pendingDeliveryCount.textContent = pending.length;
  el.statUsers.textContent = users.length;
}

export function renderAdminClients(users = [], handlers = {}) {
  if (!el.clientAdminRows || !el.clientAdminCount) return;
  const clients = users.filter((user) => user.role === "cliente");
  el.clientAdminRows.innerHTML = "";

  if (!clients.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="6">${emptyState("Todavía no hay clientes registrados.").outerHTML}</td>`;
    el.clientAdminRows.appendChild(row);
  }

  clients.forEach((client) => {
    const row = document.createElement("tr");
    const clientStatus = getClientStatus(client);
    const paymentStatus = getClientPaymentStatus(client);
    row.innerHTML = `
      <td>
        <div class="subscription-delivery-name">
          ${avatarMarkup(client, "avatar-sm")}
          <div>
            <strong>${escapeText(client.name || "Cliente")}</strong>
            <small>${escapeText(client.email || "Sin correo")}</small>
          </div>
        </div>
      </td>
      <td><span class="subscription-status ${clientStatus.className}">${clientStatus.label}</span></td>
      <td><span class="subscription-status ${paymentStatus.className}">${paymentStatus.label}</span></td>
      <td>${client.clientLastPaymentAt ? `${formatDate(client.clientLastPaymentAt)} · ${formatMoney(client.clientLastPaymentAmount)}` : "Sin pagos"}</td>
      <td>${client.clientNextPaymentDueAt ? formatDate(client.clientNextPaymentDueAt) : "Sin definir"}</td>
      <td></td>
    `;

    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.appendChild(actionButton("Activo", "button button-secondary", () => handlers.updateClientStatus?.(client, "active")));
    actions.appendChild(actionButton("Pendiente", "button button-secondary", () => handlers.updateClientStatus?.(client, "pending_payment")));
    actions.appendChild(actionButton("Bloquear", "button button-danger", () => handlers.updateClientStatus?.(client, "blocked")));
    actions.appendChild(actionButton("Registrar pago", "button button-primary", () => handlers.registerClientPayment?.(client)));
    row.querySelector("td:last-child").appendChild(actions);
    el.clientAdminRows.appendChild(row);
  });

  el.clientAdminCount.textContent = `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}`;
}
export function renderAdminOrders(orders = [], handlers, platformFee) {
  const active = orders.filter(isActiveOrder);
  const completed = orders.filter(isCompletedOrder);
  const cancelled = orders.filter(isCancelledOrder);
  const tabs = {
    active: {
      orders: active,
      emptyText: "No hay pedidos activos."
    },
    completed: {
      orders: completed,
      emptyText: "No hay pedidos completados."
    },
    cancelled: {
      orders: cancelled,
      emptyText: "No hay pedidos cancelados."
    }
  };

  orderTabState.admin = tabs[orderTabState.admin] ? orderTabState.admin : "active";
  bindOrderTabs("admin", () => renderAdminOrders(orders, handlers, platformFee));
  updateOrderTabs("admin", orderTabState.admin);
  const current = tabs[orderTabState.admin] || tabs.active;
  renderOrderList(el.adminTabbedOrders, current.orders, current.emptyText, "admin", handlers);
  el.adminOrderCount.textContent = orders.length;
  el.adminActiveCount.textContent = active.length;
  el.adminCompletedCount.textContent = completed.length;
  el.adminCancelledCount.textContent = cancelled.length;
  el.statActiveOrders.textContent = active.length;
  el.statCompletedOrders.textContent = completed.length;
  el.statRevenue.textContent = formatMoney(completed.length * platformFee);
}


export function renderStores(stores = [], handlers = {}) {
  const isAdmin = state.profile?.role === "admin";
  const activeStores = stores.filter((store) => store.active !== false);
  const visibleStores = isAdmin ? stores : activeStores;

  if (el.storeAdminControls) {
    el.storeAdminControls.classList.toggle("hidden", !isAdmin);
  }

  if (el.storesList) {
    renderStoreList(el.storesList, visibleStores, handlers, isAdmin, "Todavía no hay comercios cargados.");
  }

  if (el.clientStoresPreview) {
    renderStoreList(el.clientStoresPreview, activeStores.slice(0, 4), handlers, false, "Todavía no hay comercios cargados.");
  }

  if (el.storeCount) {
    el.storeCount.textContent = `${activeStores.length} ${activeStores.length === 1 ? "comercio" : "comercios"}`;
  }
}

function renderStoreList(container, stores, handlers, isAdmin, emptyText) {
  container.innerHTML = "";
  if (!stores.length) {
    container.appendChild(emptyState(emptyText));
    return;
  }

  stores.forEach((store) => container.appendChild(storeCard(store, handlers, isAdmin)));
}

function storeCard(store, handlers, isAdmin) {
  const card = document.createElement("article");
  card.className = "user-card store-card";
  card.innerHTML = `
    <div class="card-title">
      <strong>${escapeText(store.name || "Comercio")}</strong>
      <span class="tag">${escapeText(store.category || "Sin rubro")}</span>
    </div>
    <div class="meta-grid">
      <span>Rubro: ${escapeText(store.category || "Sin definir")}</span>
      <span>WhatsApp: ${escapeText(store.whatsapp || "Sin número")}</span>
      <span>Dirección: ${escapeText(store.address || "Sin dirección")}</span>
      <span>Estado: ${store.active === false ? "Inactivo" : "Activo"}</span>
    </div>
  `;

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const whatsappNumber = normalizeWhatsapp(store.whatsapp);
  if (whatsappNumber) {
    actions.appendChild(actionButton("Contactar por WhatsApp", "button button-primary", () => {
      window.open(`https://wa.me/${whatsappNumber}`, "_blank", "noopener");
    }));
  }

  if (isAdmin) {
    actions.appendChild(actionButton("Editar", "button button-secondary", () => handlers.editStore?.(store)));
    actions.appendChild(actionButton("Eliminar", "button button-danger", () => handlers.removeStore?.(store)));
  }

  card.appendChild(actions);
  return card;
}


function getUserProfile(uid) {
  if (!uid) return null;
  if (state.profile?.id === uid) return state.profile;
  return state.userProfiles?.[uid] || state.deliveryProfiles?.[uid] || null;
}

function profileInline(user, label) {
  return `<div class="accepted-delivery">${avatarMarkup(user, "avatar-sm")}<span>${escapeText(label)}</span></div>`;
}
function normalizeWhatsapp(value) {
  return String(value || "").replace(/\D/g, "");
}
export function renderSubscriptions(users, subscriptions, handlers) {
  const deliveries = users.filter((user) => user.role === "delivery");
  el.subscriptionDeliveries.innerHTML = "";
  el.subscriptions.innerHTML = "";

  if (!deliveries.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="6">${emptyState("Todavía no hay deliveries registrados.").outerHTML}</td>`;
    el.subscriptionDeliveries.appendChild(row);
  }

  deliveries.forEach((delivery) => {
    const row = document.createElement("tr");
    const subscriptionStatus = getSubscriptionStatus(delivery);
    row.innerHTML = `
      <td>${avatarMarkup(delivery, "avatar-sm")}</td>
      <td>
        <div class="subscription-delivery-name">
          <strong>${escapeText(delivery.name || "Delivery")}</strong>
          <small>${escapeText(delivery.email || "")}</small>
        </div>
      </td>
      <td>${escapeText(delivery.subscriptionPlanName || "Sin plan")}</td>
      <td><span class="subscription-status ${subscriptionStatus.className}">${subscriptionStatus.label}</span></td>
      <td>${formatSubscriptionDate(delivery.subscriptionExpiresAt)}</td>
      <td></td>
    `;
    row.querySelector("td:last-child").appendChild(
      actionButton("Administrar", "button button-secondary", () => openSubscriptionModal(delivery, subscriptionStatus, subscriptions, handlers))
    );
    el.subscriptionDeliveries.appendChild(row);
  });

  if (!subscriptions.length) {
    el.subscriptions.appendChild(emptyState("Todavía no cargaste planes de suscripción."));
  }

  subscriptions.forEach((subscription) => {
    const card = document.createElement("article");
    card.className = "subscription-card";
    card.innerHTML = `
      <div class="card-title">
        <strong>${escapeText(subscription.name)}</strong>
        <span class="tag">${formatMoney(subscription.price)}</span>
      </div>
      <p class="meta">Plan mensual para gestionar acceso o beneficios comerciales.</p>
    `;
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const remove = actionButton("Eliminar", "button button-danger", () => handlers.removeSubscription(subscription.id));
    actions.appendChild(remove);
    card.appendChild(actions);
    el.subscriptions.appendChild(card);
  });

  el.subscriptionCount.textContent = `${deliveries.length} ${deliveries.length === 1 ? "delivery" : "deliveries"}`;
}

function getClientStatus(client) {
  const status = client.clientStatus || "active";
  const labels = {
    active: { label: "🟢 Activo", className: "subscription-active" },
    pending_payment: { label: "🟡 Pendiente de pago", className: "subscription-warning" },
    blocked: { label: "🔴 Bloqueado", className: "subscription-expired" }
  };
  return labels[status] || { label: escapeText(status), className: "subscription-none" };
}

function getClientPaymentStatus(client) {
  const status = client.clientPaymentStatus || "unpaid";
  const labels = {
    paid: { label: "🟢 Pagado", className: "subscription-active" },
    unpaid: { label: "⚪ Sin pago", className: "subscription-none" },
    overdue: { label: "🔴 Vencido", className: "subscription-expired" }
  };
  return labels[status] || { label: escapeText(status), className: "subscription-none" };
}
function getSubscriptionStatus(delivery) {
  if (!delivery.subscriptionPlanId || !delivery.subscriptionExpiresAt) {
    return { label: "⚪ Sin plan", className: "subscription-none" };
  }

  const today = new Date();
  const expiresAt = toDate(delivery.subscriptionExpiresAt);
  const daysLeft = Math.ceil((expiresAt - today) / (1000 * 60 * 60 * 24));

  if (expiresAt < today) {
    return { label: "🔴 Vencida", className: "subscription-expired" };
  }

  if (daysLeft <= 7) {
    return { label: "🟡 Próxima a vencer", className: "subscription-warning" };
  }

  return { label: "🟢 Activa", className: "subscription-active" };
}

function openSubscriptionModal(delivery, subscriptionStatus, subscriptions, handlers) {
  const selectedPlanId = delivery.subscriptionPlanId || subscriptions[0]?.id || "";
  const planOptions = subscriptions.length
    ? subscriptions.map((plan) => `<option value="${escapeText(plan.id)}" ${plan.id === selectedPlanId ? "selected" : ""}>${escapeText(plan.name)} · ${formatMoney(plan.price)}</option>`).join("")
    : `<option value="">No hay planes creados</option>`;

  el.subscriptionModalTitle.textContent = `Administrar ${delivery.name || "delivery"}`;
  el.subscriptionModalBody.innerHTML = `
    <div class="subscription-modal-profile">
      ${avatarMarkup(delivery, "avatar-lg")}
      <div>
        <strong>${escapeText(delivery.name || "Delivery")}</strong>
        <span>${escapeText(delivery.email || "Sin correo")}</span>
      </div>
    </div>
    <div class="meta-grid">
      <span>Suscripción: ${subscriptionStatus.label}</span>
      <span>Plan: ${escapeText(delivery.subscriptionPlanName || "Sin plan")}</span>
      <span>Inicio: ${formatSubscriptionDate(delivery.subscriptionStartAt)}</span>
      <span>Vencimiento: ${formatSubscriptionDate(delivery.subscriptionExpiresAt)}</span>
    </div>
    <label>
      Plan
      <select id="subscriptionPlanSelect" ${subscriptions.length ? "" : "disabled"}>${planOptions}</select>
    </label>
  `;

  const actions = el.subscriptionModal.querySelector(".subscription-modal-actions");
  actions.innerHTML = "";
  const assign = actionButton("Asignar plan", "button button-primary", () => {
    const planId = document.getElementById("subscriptionPlanSelect").value;
    handlers.assignSubscription(delivery, planId);
  });
  const renew = actionButton("Renovar 30 días", "button button-secondary", () => {
    const planId = document.getElementById("subscriptionPlanSelect").value;
    handlers.renewSubscription(delivery, planId);
  });
  assign.disabled = !subscriptions.length;
  renew.disabled = !subscriptions.length && !delivery.subscriptionPlanId;
  actions.appendChild(assign);
  actions.appendChild(renew);
  actions.appendChild(actionButton("Cerrar", "button button-secondary", () => el.subscriptionModal.classList.add("hidden")));
  el.subscriptionModal.classList.remove("hidden");
}

function formatSubscriptionDate(value) {
  if (!value) return "Sin definir";
  return formatDate(value);
}

function toDate(value) {
  return value.toDate ? value.toDate() : new Date(value);
}

function renderOrderList(container, orders, emptyText, context, handlers, options = {}) {
  if (!container) return;
  container.innerHTML = "";
  if (!orders.length) {
    container.appendChild(emptyState(emptyText));
    return;
  }

  orders.forEach((order) => {
    try {
      container.appendChild(orderCard(order, context, handlers, options));
    } catch (error) {
      console.error("[renderOrderList] No se pudo renderizar pedido", order?.id, error, order);
    }
  });

  if (!container.children.length) {
    container.appendChild(emptyState("No pudimos mostrar estos pedidos. Revisá la consola para ver el detalle."));
  }
}

function orderCard(order = {}, context, handlers, options = {}) {
  const card = document.createElement("article");
  card.className = "order-card";
  const normalizedStatus = normalizeOrderStatus(order.status);
  const status = statusLabels[normalizedStatus] || statusLabels[order.status] || order.status || "Nuevo";
  const deliveryProfile = order.deliveryId
    ? getUserProfile(order.deliveryId) || { name: order.deliveryName, photoURL: "" }
    : null;
  const clientProfile = getUserProfile(order.clientId) || {
    name: order.clientName,
    photoURL: ""
  };
  const deliveryAvatar = deliveryProfile
    ? profileInline(deliveryProfile, `Delivery aceptado: ${order.deliveryName || deliveryProfile.name || "Sin asignar"}`)
    : "";
  const clientAvatar = context === "delivery" || context === "deliveryMine"
    ? profileInline(clientProfile, `Cliente: ${order.clientName || clientProfile.name || "Cliente"}`)
    : "";
  const instructions = String(order.description || "").trim();
  const instructionsText = instructions || "💬 El cliente no dejó instrucciones adicionales.";
  const paymentMethodKey = typeof order.paymentMethod === "string" ? order.paymentMethod : "";
  const paymentMethod = paymentMethodLabels[paymentMethodKey] || paymentMethodKey || "Efectivo";
  const imageUrl = typeof order.imageUrl === "string" ? order.imageUrl.trim() : "";
  const orderImage = imageUrl
    ? `<a class="order-image-link" href="${escapeText(imageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir imagen del pedido en grande"><img src="${escapeText(imageUrl)}" alt="Imagen adjunta al pedido" loading="lazy" /></a>`
    : "";
  card.innerHTML = `
    <div class="card-title">
      <strong>${escapeText(order.category || "Mandado")}</strong>
      <span class="tag">${escapeText(status)}</span>
    </div>
    ${deliveryAvatar}
    ${clientAvatar}
    <div class="order-instructions-card">
      <h4>📋 ¿Qué necesitás que hagamos por vos?</h4>
      <p>${escapeText(instructionsText)}</p>
    </div>
    ${orderImage}
    <div class="meta-grid">
      <span>Entrega: ${escapeText(order.address)}</span>
      <span>Prioridad: ${escapeText(order.priority || "normal")}</span>
      <span>Método de pago: ${escapeText(paymentMethod)}</span>
      <span>Cliente: ${escapeText(order.clientName || "Cliente")}</span>
      <span>Delivery: ${escapeText(order.deliveryName || "Sin asignar")}</span>
      <span>Fecha: ${formatDate(order.createdAt)}</span>
      <span>Calificación: ${
  order.rating != null
    ? `⭐ ${order.rating}/5`
    : "Sin calificar"
}</span>
    </div>
    ${order.notes ? `<p class="meta">${escapeText(order.notes)}</p>` : ""}
  `;

  const actions = document.createElement("div");
  actions.className = "card-actions";

  if (context === "cliente") {
    actions.appendChild(actionButton("Chat", "button button-secondary", () => handlers.openChat(order)));
    if (isAvailableOrder(order)) {
      actions.appendChild(actionButton("Cancelar", "button button-danger", () => handlers.cancel(order)));
    }
    if (isCompletedOrder(order) && order.rating == null) {
      [5, 4, 3].forEach((rating) => {
        actions.appendChild(actionButton(`${rating} estrellas`, "button button-secondary", () => handlers.rate(order.id, rating)));
      });
    }
  }

  if (context === "delivery" && options.canAccept) {
    actions.appendChild(actionButton("Aceptar", "button button-primary", () => handlers.accept(order.id)));
  }

  if (context === "deliveryMine") {
    actions.appendChild(actionButton("Chat", "button button-secondary", () => handlers.openChat(order)));
    if (["accepted", "aceptado", "assigned", "asignado", "taken", "tomado"].includes(normalizedStatus)) {
      actions.appendChild(actionButton("En camino", "button button-primary", () => handlers.mark(order.id, "in_progress")));
    }
    if (isDeliveryInProgressOrder(order)) {
      actions.appendChild(actionButton("Completar", "button button-primary", () => handlers.mark(order.id, "completed")));
    }
  }

  if (context === "admin") {
    actions.appendChild(actionButton("Chat", "button button-secondary", () => handlers.openChat(order)));
    if (!isCancelledOrder(order) && !isCompletedOrder(order)) {
      actions.appendChild(actionButton("Cancelar", "button button-danger", () => handlers.mark(order.id, "cancelled")));
    }
  }

  card.appendChild(actions);
  return card;
}

function userCard(user, handlers, pending = false) {
  const card = document.createElement("article");
  card.className = "user-card";
  card.innerHTML = `
    <div class="card-title">
      <strong>${escapeText(user.name)}</strong>
      <span class="tag">${escapeText(roleLabels[user.role] || user.role)}</span>
    </div>
    <div class="meta-grid">
      <span>${escapeText(user.email)}</span>
      <span>Estado: ${escapeText(user.status || "active")}</span>
      <span>Disponible: ${user.available ? "Sí" : "No"}</span>
      <span>Alta: ${formatDate(user.createdAt)}</span>
    </div>
  `;

  const actions = document.createElement("div");
  actions.className = "card-actions";
  if (pending) actions.appendChild(actionButton("Aprobar delivery", "button button-primary", () => handlers.approve(user.id)));
  if (user.role !== "admin") {
    actions.appendChild(actionButton(user.suspended ? "Reactivar" : "Suspender", "button button-danger", () => handlers.suspend(user)));
  }
  card.appendChild(actions);
  return card;
}


function updateChatIndicators() {
  const count = state.unreadChatOrderIds?.length || 0;
  document.querySelectorAll('[data-panel="chat"]').forEach((button) => {
    button.classList.toggle("has-unread", count > 0);
    let badge = button.querySelector(".chat-unread-badge");
    if (!count) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "chat-unread-badge";
      button.appendChild(badge);
    }
    badge.textContent = count > 9 ? "9+" : String(count);
  });
}
function navButton(item, activePanel, className) {
  const button = document.createElement("button");
  button.className = `${className} ${item.id === activePanel ? "active" : ""}`;
  button.type = "button";
  button.textContent = item.label;
  button.dataset.panel = item.id;
  return button;
}

function actionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function avatarMarkup(user, sizeClass = "") {
  return `<div class="avatar ${sizeClass}" aria-hidden="true">${avatarContent(user)}</div>`;
}

function avatarContent(user = {}) {
  if (user.photoURL) {
    return `<img src="${escapeText(user.photoURL)}" alt="" loading="lazy" />`;
  }

  return `<span>${getInitial(user.name)}</span>`;
}

function getInitial(name = "") {
  const initial = String(name).trim().charAt(0) || "A";
  return escapeText(initial.toUpperCase());
}

