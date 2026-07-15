<template>
  <ProfileLayout>
    <div class="storage-plan-content">
      <div class="storage-plan-header">
        <h1 class="storage-plan-title">Choose Your Storage & Plan</h1>
        <p class="storage-plan-subtitle">
          Set up your storage preferences and select the plan that fits your
          needs
        </p>
      </div>

      <!-- Storage Selection Section -->
      <div class="storage-selection">
        <h3 class="section-title">Select Storage</h3>
        <p class="section-subtitle">
          Choose how many photos you plan to store in Photoreka
        </p>

        <div class="storage-options-grid">
          <div
            class="storage-option-card storage-free"
            :class="{ selected: selectedStorage === 'free' }"
            @click="selectStorage('free')"
          >
            <div class="storage-badge">Free Trial</div>
            <div class="storage-icon">
              <n-icon size="32">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M5 3l3.057-3L12 3.264L15.943 0L19 3v18l-3.057-3L12 20.736L8.057 18L5 21V3z"
                  />
                </svg>
              </n-icon>
            </div>
            <h4 class="storage-title">Try for Free</h4>
            <div class="storage-photos">200 photos</div>
            <p class="storage-description">
              Perfect to get started and explore Photoreka features
            </p>
            <div class="storage-price">Free</div>
            <p class="storage-notes">
              Includes 100 photos for batch upload and 10 for individual uploads
            </p>
          </div>

          <div
            class="storage-option-card storage-standard"
            :class="{ selected: selectedStorage === 'standard' }"
            @click="selectStorage('standard')"
          >
            <div class="storage-icon">
              <n-icon size="32">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M2 6h20v12H2V6zm2 2v8h16V8H4zm2 2h2v4H6v-4zm4 0h2v4h-2v-4zm4 0h2v4h-2v-4z"
                  />
                </svg>
              </n-icon>
            </div>
            <h4 class="storage-title">Standard Storage</h4>
            <div class="storage-photos">1,000 photos</div>
            <p class="storage-description">
              Great for hobbyist photographers with regular usage
            </p>
            <div class="storage-price">$24.99</div>
            <p class="storage-notes">
              Includes 500 photos for batch upload and 50 for individual uploads
            </p>
          </div>

          <div
            class="storage-option-card storage-premium"
            :class="{ selected: selectedStorage === 'premium' }"
            @click="selectStorage('premium')"
          >
            <div class="storage-badge">Popular</div>
            <div class="storage-icon">
              <n-icon size="32">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  />
                </svg>
              </n-icon>
            </div>
            <h4 class="storage-title">Premium Storage</h4>
            <div class="storage-photos">5,000 photos</div>
            <p class="storage-description">
              Perfect for professional photographers and content creators
            </p>
            <div class="storage-price">$89.99</div>
            <p class="storage-notes">
              Includes 3,000 photos for batch upload and 200 for individual
              uploads
            </p>
          </div>
        </div>
      </div>

      <!-- Subscription Plans Section -->
      <div class="subscription-selection">
        <h3 class="section-title">Choose Your Plan</h3>
        <p class="section-subtitle">
          Select the feature package that matches your workflow needs
        </p>

        <div class="subscription-plans-grid">
          <div
            class="plan-card plan-free"
            :class="{ selected: selectedPlan === 'free' }"
            @click="selectPlan('free')"
          >
            <div class="plan-header">
              <h4 class="plan-name">Free Plan</h4>
              <div class="plan-price">
                <span class="price-amount">$0</span>
                <span class="price-period">/month</span>
              </div>
              <p class="plan-description">Essential features to get started</p>
            </div>

            <div class="plan-features">
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Basic photo organization</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>5 heavy queries/month</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>2 curations/month</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Basic AI descriptions</span>
              </div>
              <div class="feature-item disabled">
                <n-icon size="16" color="var(--text-tertiary)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                    />
                  </svg>
                </n-icon>
                <span>Canvas access</span>
              </div>
              <div class="feature-item disabled">
                <n-icon size="16" color="var(--text-tertiary)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                    />
                  </svg>
                </n-icon>
                <span>Advanced search</span>
              </div>
            </div>
          </div>

          <div
            class="plan-card plan-advanced"
            :class="{ selected: selectedPlan === 'advanced' }"
            @click="selectPlan('advanced')"
          >
            <div class="plan-badge">Popular</div>
            <div class="plan-header">
              <h4 class="plan-name">Advanced</h4>
              <div class="plan-price">
                <span class="price-amount">$19.99</span>
                <span class="price-period">/month</span>
              </div>
              <p class="plan-description">
                Great for professional photographers
              </p>
            </div>

            <div class="plan-features">
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Advanced photo organization</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>20 heavy queries/month</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>10 curations/month</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Unlimited AI descriptions</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Canvas access</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Advanced search</span>
              </div>
            </div>
          </div>

          <div
            class="plan-card plan-pro"
            :class="{ selected: selectedPlan === 'pro' }"
            @click="selectPlan('pro')"
          >
            <div class="plan-header">
              <h4 class="plan-name">Pro</h4>
              <div class="plan-price">
                <span class="price-amount">$49.99</span>
                <span class="price-period">/month</span>
              </div>
              <p class="plan-description">For teams and agencies</p>
            </div>

            <div class="plan-features">
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Advanced photo organization</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Unlimited heavy queries</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Unlimited curations</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Unlimited AI descriptions</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Canvas access</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Advanced search</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>Priority support</span>
              </div>
              <div class="feature-item">
                <n-icon size="16" color="var(--success-color)">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </n-icon>
                <span>API access</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary Section -->
      <div class="selection-summary" v-if="selectedStorage && selectedPlan">
        <h3 class="summary-title">Your Selection</h3>
        <div class="summary-details">
          <div class="summary-item">
            <span class="summary-label">Storage:</span>
            <span class="summary-value"
              >{{ getStorageDetails().title }} -
              {{ getStorageDetails().photos }}</span
            >
          </div>
          <div class="summary-item">
            <span class="summary-label">Plan:</span>
            <span class="summary-value">{{ getPlanDetails().name }}</span>
          </div>
          <div class="summary-item total">
            <span class="summary-label">Total:</span>
            <span class="summary-value">{{ getTotalPrice() }}/month</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="storage-plan-actions">
        <n-button
          type="primary"
          size="large"
          :disabled="!selectedStorage || !selectedPlan"
          @click="completeSetup"
          class="complete-button"
        >
          Complete Setup
        </n-button>
        <n-button text size="medium" @click="goBack" class="back-button">
          ← Back to Profile Setup
        </n-button>
      </div>
    </div>
  </ProfileLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import ProfileLayout from "../components/ProfileLayout.vue";

const router = useRouter();
const message = useMessage();

onMounted(() => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
});

const selectedStorage = ref<string>("");
const selectedPlan = ref<string>("");

const selectStorage = (storage: string) => {
  selectedStorage.value = storage;
};

const selectPlan = (plan: string) => {
  selectedPlan.value = plan;
};

const getStorageDetails = () => {
  const storageMap = {
    free: { title: "Try for Free", photos: "200 photos", price: 0 },
    standard: {
      title: "Standard Storage",
      photos: "1,000 photos",
      price: 24.99,
    },
    premium: { title: "Premium Storage", photos: "5,000 photos", price: 89.99 },
  };
  return (
    storageMap[selectedStorage.value as keyof typeof storageMap] ||
    storageMap.free
  );
};

const getPlanDetails = () => {
  const planMap = {
    free: { name: "Free Plan", price: 0 },
    advanced: { name: "Advanced", price: 19.99 },
    pro: { name: "Pro", price: 49.99 },
  };
  return planMap[selectedPlan.value as keyof typeof planMap] || planMap.free;
};

const getTotalPrice = () => {
  const storagePrice = getStorageDetails().price;
  const planPrice = getPlanDetails().price;

  if (storagePrice === 0 && planPrice === 0) return "Free";

  let result = "";
  if (storagePrice > 0) {
    result += `$${storagePrice.toFixed(2)} storage`;
  }
  if (planPrice > 0) {
    if (result) result += " + ";
    result += `$${planPrice.toFixed(2)}/month`;
  }

  return result;
};

const completeSetup = () => {
  // TODO: Save storage and plan preferences to store/backend
  console.log("Selected Storage:", selectedStorage.value);
  console.log("Selected Plan:", selectedPlan.value);
  console.log("Storage Details:", getStorageDetails());
  console.log("Plan Details:", getPlanDetails());
  console.log("Total Price:", getTotalPrice());

  message.success("Setup completed! Welcome to Photoreka.");
  router.push("/");
};

const goBack = () => {
  router.push("/profile-setup");
};
</script>

<style scoped>
.storage-plan-content {
  width: 100%;
  margin: 0 auto;
}

.storage-plan-header {
  text-align: center;
  margin-bottom: 40px;
}

.storage-plan-title {
  margin: 16px 0 8px 0;
  font-size: 32px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: -0.025em;
}

.storage-plan-subtitle {
  margin: 0 0 24px 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 400;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
}

.section-subtitle {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 400;
}

/* Storage Selection */
.storage-selection {
  margin-bottom: 48px;
}

.storage-options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.storage-option-card {
  background-color: var(--bg-surface);
  border: 2px solid #3c3c42;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.storage-option-card:hover {
  border-color: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
}

.storage-option-card.selected {
  border-color: #2563eb;
  background-color: rgba(37, 99, 235, 0.1);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
}

.storage-badge {
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #2563eb;
  color: white;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 0 0 6px 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.storage-icon {
  margin-bottom: 16px;
  color: var(--text-secondary);
}

.storage-option-card.selected .storage-icon {
  color: #2563eb;
}

.storage-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
}

.storage-photos {
  margin: 0 0 12px 0;
  font-size: 24px;
  font-weight: 700;
  color: #2563eb;
}

.storage-description {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
  flex: 1;
}

.storage-price {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
}

.storage-notes {
  margin: 8px 0 0 0;
  font-size: 11px;
  color: #ffffff60;
  line-height: 1.3;
  font-style: italic;
}

/* Tier-specific colors for storage */
.storage-free:hover {
  border-color: #10b981;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.2);
}

.storage-free.selected {
  border-color: #10b981;
  background-color: rgba(16, 185, 129, 0.1);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
}

.storage-free.selected .storage-icon,
.storage-free.selected .storage-photos {
  color: #10b981;
}

.storage-free .storage-badge {
  background-color: #10b981;
}

.storage-standard:hover {
  border-color: #2563eb;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
}

.storage-standard.selected {
  border-color: #2563eb;
  background-color: rgba(37, 99, 235, 0.1);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
}

.storage-standard.selected .storage-icon,
.storage-standard.selected .storage-photos {
  color: #2563eb;
}

.storage-premium:hover {
  border-color: #f59e0b;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.2);
}

.storage-premium.selected {
  border-color: #f59e0b;
  background-color: rgba(245, 158, 11, 0.1);
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.3);
}

.storage-premium.selected .storage-icon,
.storage-premium.selected .storage-photos {
  color: #f59e0b;
}

.storage-premium .storage-badge {
  background-color: #f59e0b;
}

/* Tier-specific colors for subscription plans - matching storage exactly */
.plan-free:hover:not(.disabled) {
  border-color: #10b981;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.2);
}

.plan-free.selected {
  border-color: #10b981;
  background-color: rgba(16, 185, 129, 0.1);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
}

.plan-free.selected .price-amount {
  color: #10b981;
}

.plan-advanced:hover:not(.disabled) {
  border-color: #2563eb;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
}

.plan-advanced.selected {
  border-color: #2563eb;
  background-color: rgba(37, 99, 235, 0.1);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
}

.plan-advanced.selected .price-amount {
  color: #2563eb;
}

.plan-advanced .plan-badge {
  background-color: #2563eb;
}

.plan-pro:hover:not(.disabled) {
  border-color: #f59e0b;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.2);
}

.plan-pro.selected {
  border-color: #f59e0b;
  background-color: rgba(245, 158, 11, 0.1);
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.3);
}

.plan-pro.selected .price-amount {
  color: #f59e0b;
}

/* Subscription Plans */
.subscription-selection {
  margin-bottom: 40px;
}

.subscription-plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.plan-card {
  background-color: var(--bg-surface);
  border: 2px solid #3c3c42;
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 360px;
}

.plan-card:hover:not(.disabled) {
  border-color: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
}

.plan-card.selected {
  border-color: #2563eb;
  background-color: rgba(37, 99, 235, 0.1);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
}

.plan-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

.plan-badge {
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #2563eb;
  color: white;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 0 0 6px 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.plan-header {
  text-align: center;
  margin-bottom: 24px;
  padding-top: 12px;
}

.plan-name {
  margin: 0 0 12px 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-secondary);
}

.plan-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  margin-bottom: 12px;
}

.price-amount {
  font-size: 28px;
  font-weight: 700;
  color: #2563eb;
}

.price-period {
  font-size: 14px;
  color: var(--text-primary);
}

.plan-description {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.4;
}

.plan-features {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}

.feature-item.disabled {
  color: #ffffff40;
}

/* Selection Summary */
.selection-summary {
  background-color: rgba(37, 99, 235, 0.1);
  border: 1px solid rgba(37, 99, 235, 0.3);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 32px;
}

.summary-title {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
}

.summary-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.summary-item.total {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  padding-top: 8px;
  margin-top: 8px;
  font-weight: 600;
}

.summary-label {
  color: var(--text-primary);
}

.summary-value {
  color: var(--text-secondary);
  font-weight: 500;
}

.summary-item.total .summary-value {
  color: #2563eb;
  font-size: 18px;
  font-weight: 700;
}

/* Actions */
.storage-plan-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
}

.complete-button {
  width: 200px;
  height: 48px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 16px;
}

.back-button {
  font-size: 14px;
  color: var(--text-primary);
}

/* Responsive design */
@media (max-width: 1024px) {
  .storage-options-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .subscription-plans-grid {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 20px;
  }
}

@media (max-width: 768px) {
  .storage-plan-title {
    font-size: 28px;
  }

  .storage-options-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .subscription-plans-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .storage-option-card,
  .plan-card {
    min-height: auto;
    padding: 20px;
  }

  .plan-features {
    gap: 10px;
  }

  .summary-details {
    gap: 12px;
  }

  .summary-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}

@media (max-width: 480px) {
  .storage-plan-title {
    font-size: 24px;
  }

  .storage-option-card,
  .plan-card {
    padding: 16px;
  }

  .storage-title {
    font-size: 16px;
  }

  .plan-name {
    font-size: 18px;
  }

  .price-amount {
    font-size: 24px;
  }

  .feature-item {
    font-size: 13px;
  }
}
</style>
