const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {FieldValue, getFirestore} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

initializeApp();

exports.notifyAvailableDeliveries = onDocumentCreated(
    "orders/{orderId}",
    async (event) => {
      const order = event.data.data();
      const db = getFirestore();
      const messaging = getMessaging();
      const snapshot = await db.collection("users")
          .where("role", "==", "delivery")
          .where("available", "==", true)
          .where("status", "==", "active")
          .get();
      const recipients = snapshot.docs.filter((document) => {
        const delivery = document.data();
        return !delivery.suspended && delivery.fcmToken;
      });

      if (!recipients.length) return;

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

      if (before.status !== "new" || after.status !== "accepted") return;
      if (!after.clientId) return;

      const db = getFirestore();
      const messaging = getMessaging();
      const clientRef = db.collection("users").doc(after.clientId);
      const clientSnapshot = await clientRef.get();
      if (!clientSnapshot.exists) return;

      const client = clientSnapshot.data();
      const tokensSnapshot = await clientRef.collection("fcmTokens").get();
      const tokenEntries = tokensSnapshot.docs
          .map((document) => ({
            token: document.data().token,
            ref: document.ref,
          }))
          .filter((entry) => entry.token);

      if (!tokenEntries.length && client.fcmToken) {
        tokenEntries.push({
          token: client.fcmToken,
          ref: null,
        });
      }

      if (!tokenEntries.length) return;

      const deliveryName = after.deliveryName || "Un delivery";
      const notificationTitle = "Pedido aceptado";
      const notificationBody = `🛵 ${deliveryName} aceptó tu pedido.`;

      try {
        const response = await messaging.sendEachForMulticast({
          tokens: tokenEntries.map((entry) => entry.token),
          notification: {
            title: notificationTitle,
            body: notificationBody,
          },
          data: {
            title: notificationTitle,
            body: notificationBody,
            url: "/",
          },
          webpush: {
            notification: {
              title: notificationTitle,
              body: notificationBody,
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
            },
            fcmOptions: {
              link: "https://altoque-74f3d.web.app/",
            },
          },
        });

        const invalidTokenUpdates = [];
        response.responses.forEach((result, index) => {
          const entry = tokenEntries[index];
          const code = result.error && result.error.code;
          if (code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token") {
            if (entry.ref) invalidTokenUpdates.push(entry.ref.delete());
            if (entry.token === client.fcmToken) {
              invalidTokenUpdates.push(clientRef.update({
                fcmToken: FieldValue.delete(),
              }));
            }
          }
        });

        await Promise.all(invalidTokenUpdates);
      } catch (error) {
        console.error("[notifyClientOrderAccepted] send ERROR:", error);
        throw error;
      }
    },
);
exports.expireOverdueClients = onSchedule(
    {
      schedule: "0 3 * * *",
      timeZone: "America/Argentina/Buenos_Aires",
    },
    async () => {
      const now = new Date();
      const db = getFirestore();
      const snapshot = await db.collection("users")
          .where("role", "==", "cliente")
          .where("clientStatus", "==", "active")
          .get();

      const batch = db.batch();
      let updatedCount = 0;

      snapshot.docs.forEach((document) => {
        const client = document.data();
        const dueAt = client.clientNextPaymentDueAt;
        if (!dueAt) return;

        const dueDate = dueAt.toDate ? dueAt.toDate() : new Date(dueAt);
        if (Number.isNaN(dueDate.getTime()) || dueDate >= now) return;

        batch.update(document.ref, {
          clientStatus: "pending_payment",
          clientPaymentStatus: "unpaid",
        });
        updatedCount += 1;
      });

      if (updatedCount > 0) await batch.commit();
    },
);
