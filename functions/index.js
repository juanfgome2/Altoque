const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");

initializeApp();

const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");
exports.notifyAvailableDeliveries = onDocumentCreated(
    "orders/{orderId}",
    async (event) => {
      const order = event.data.data();
      const db = getFirestore();
      const snapshot = await db.collection("users")
          .where("role", "==", "delivery")
          .where("available", "==", true)
          .where("status", "==", "active")
          .get();
      const recipients = snapshot.docs.filter((document) => {
        const delivery = document.data();
        return !delivery.suspended && delivery.fcmToken;
      });

      if (!recipients.length) {
        console.log("No hay deliveries disponibles con notificaciones activas");
        return;
      }
      const messaging = getMessaging();
      const response = await messaging.sendEachForMulticast({
        tokens: recipients.map((document) => document.data().fcmToken),
        data: {
          title: "Nuevo pedido disponible",
          category: String(order.category || ""),
          address: String(order.address || ""),
          url: "/",
        },
      });

      const invalidTokens = [];
      response.responses.forEach((result, index) => {
        const code = result.error && result.error.code;
        if (code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token") {
          invalidTokens.push(recipients[index].ref);
        }
      });

      await Promise.all(invalidTokens.map((reference) => reference.update({
        fcmToken: FieldValue.delete(),
      })));
    },
);

exports.notifyClientOrderAccepted = onDocumentUpdated(
    "orders/{orderId}",
    async (event) => {
      const before = event.data.before.data();
      const after = event.data.after.data();
      const orderId = event.params.orderId;

      console.log("[notifyClientOrderAccepted] orderId:", orderId);
      console.log(
          "[notifyClientOrderAccepted] status:",
          before.status,
          "->",
          after.status,
      );
      console.log(
          "[notifyClientOrderAccepted] clientId:",
          after.clientId || null,
      );

      if (before.status !== "new" || after.status !== "accepted") {
        console.log("[notifyClientOrderAccepted] ignored status change");
        return;
      }
      if (!after.clientId) {
        console.log("[notifyClientOrderAccepted] ignored missing clientId");
        return;
      }
      const db = getFirestore();
      const clientRef = db.collection("users").doc(after.clientId);
      const clientSnapshot = await clientRef.get();
      console.log(
          "[notifyClientOrderAccepted] client exists:",
          clientSnapshot.exists,
      );
      if (!clientSnapshot.exists) return;

      const client = clientSnapshot.data();
      console.log(
          "[notifyClientOrderAccepted] client has fcmToken:",
          Boolean(client.fcmToken),
      );
      if (!client.fcmToken) return;

      const deliveryName = after.deliveryName || "Un delivery";

      try {
        const messaging = getMessaging();
        const messageId = await messaging.send({
          token: client.fcmToken,
          data: {
            title: "Pedido aceptado",
            body: `\uD83D\uDEF5 ${deliveryName} acepto tu pedido.`,
            url: "/",
          },
        });
        console.log("[notifyClientOrderAccepted] send OK:", messageId);
      } catch (error) {
        console.error("[notifyClientOrderAccepted] send ERROR:", error);
        const code = error && error.code;
        if (code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token") {
          await clientRef.update({
            fcmToken: FieldValue.delete(),
          });
          console.log("[notifyClientOrderAccepted] invalid token deleted");
          return;
        }
        throw error;
      }
    },
);
