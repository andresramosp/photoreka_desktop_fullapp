<template>
  <div class="scoring-view">
    <div class="page-head">
      <div>
        <h1>Scoring</h1>
        <p>
          Regularización de puntuaciones artísticas entre casi-duplicados. Se
          elige un usuario, se simula su catálogo completo y se ejecuta lo que
          falte. Es progresivo: dos semanas después, con fotos nuevas, se vuelve
          a simular y solo aparece lo nuevo.
        </p>
      </div>
    </div>

    <div class="picker">
      <div class="control">
        <label>Usuario</label>
        <n-select
          v-model:value="selectedUserId"
          :options="userOptions"
          :loading="loadingUsers"
          filterable
          clearable
          placeholder="Busca por nombre o email"
          style="width: 380px"
        />
      </div>

      <div v-if="selectedUser" class="picked">
        <span class="picked-name">{{ selectedUser.name }}</span>
        <span class="picked-email">{{ selectedUser.email }}</span>
        <n-tag size="small" :bordered="false">
          {{ selectedUser.photosCount }} fotos
        </n-tag>
        <router-link
          class="picked-link"
          :to="{ name: 'admin-user-detail', params: { id: selectedUser.id } }"
        >
          ver ficha
        </router-link>
      </div>
    </div>

    <div class="panel">
      <!-- La `key` remonta el panel al cambiar de usuario: una simulación es de un
           catálogo concreto y no debe sobrevivir al cambio. -->
      <ScoreSmoothingPanel
        v-if="selectedUserId"
        :key="selectedUserId"
        mode="user"
        :target-id="selectedUserId"
      />
      <div v-else class="empty">Elige un usuario para empezar.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NSelect, NTag, useMessage } from "naive-ui";
import { api } from "../../utils/axios";
import ScoreSmoothingPanel from "../../components/admin/ScoreSmoothingPanel.vue";

interface ScoringUser {
  id: number;
  name: string;
  email: string;
  photosCount: number;
}

const route = useRoute();
const router = useRouter();
const message = useMessage();

const users = ref<ScoringUser[]>([]);
const loadingUsers = ref(false);
const selectedUserId = ref<number | null>(null);

const userOptions = computed(() =>
  users.value.map((user) => ({
    label: `${user.name} · ${user.email} (${user.photosCount})`,
    value: user.id,
  })),
);

const selectedUser = computed(
  () => users.value.find((user) => user.id === selectedUserId.value) ?? null,
);

// El usuario elegido va en la URL: así el enlace es compartible y sobrevive a un
// refresco, que es justo lo que hace falta en un proceso de varias sesiones.
function syncQuery(userId: number | null) {
  router.replace({
    query: userId ? { ...route.query, user: String(userId) } : {},
  });
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const { data } = await api.get("/api/admin/users");
    users.value = data.users;
  } catch {
    message.error("No se pudo cargar la lista de usuarios");
  } finally {
    loadingUsers.value = false;
  }
}

watch(selectedUserId, (value) => syncQuery(value));

onMounted(async () => {
  await loadUsers();
  const fromQuery = Number(route.query.user);
  if (Number.isFinite(fromQuery) && fromQuery > 0) {
    selectedUserId.value = fromQuery;
  }
});
</script>

<style scoped>
.scoring-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-head h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}

.page-head p {
  margin: 0;
  max-width: 760px;
  font-size: 12px;
  line-height: 1.6;
  color: #94a3b8;
}

.picker {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  flex-wrap: wrap;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}

.picked {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 4px;
  font-size: 12px;
}

.picked-name {
  font-weight: 600;
  color: #1e293b;
}

.picked-email {
  color: #94a3b8;
}

.picked-link {
  color: #4f46e5;
  text-decoration: none;
  font-size: 11px;
}

.picked-link:hover {
  text-decoration: underline;
}

.panel {
  padding: 16px;
  background: #fff;
  border: 1px solid #e8ecf0;
  border-radius: 12px;
}

.empty {
  padding: 28px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}
</style>
