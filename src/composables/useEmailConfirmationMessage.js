import { watch, ref } from "vue";
import { useUserStore } from "@/stores/userStore";
import { useMessage } from "naive-ui";

export function useEmailConfirmationMessage() {
  const userStore = useUserStore();
  const message = useMessage();
  const messageId = ref(null);

  const showEmailConfirmationMessage = () => {
    if (!messageId.value) {
      messageId.value = message.warning(
        "Por favor confirma tu email para acceder a todas las funciones",
        {
          duration: 0,
          closable: true,
          onClose: () => {
            messageId.value = null;
          },
        }
      );
    }
  };

  const hideEmailConfirmationMessage = () => {
    messageId.value = null;
  };

  watch(
    () => userStore.user?.isEmailConfirmed,
    (isEmailConfirmed) => {
      if (userStore.isAuthenticated && isEmailConfirmed === false) {
        showEmailConfirmationMessage();
      } else if (isEmailConfirmed === true) {
        hideEmailConfirmationMessage();
      }
    },
    { immediate: true }
  );

  return {
    messageId,
  };
}
