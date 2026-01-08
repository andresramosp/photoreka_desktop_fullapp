<template>
  <div class="terms-page">
    <!-- Navigation Header -->
    <nav class="landing-nav">
      <div class="nav-container">
        <div class="nav-brand">
          <div class="logo">
            <AppLogo layout="horizontal" :height="40" />
          </div>
        </div>
        <div class="nav-actions">
          <n-button text @click="goHome"> Back to Home </n-button>
        </div>
      </div>
    </nav>

    <!-- Terms Content -->
    <div class="terms-container">
      <div class="terms-content">
        <h1 class="terms-title">Photoreka Terms of Use and Image Policy</h1>

        <section class="terms-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By using Photoreka, you agree to comply with these Terms of Use and
            our Image Policy. If you do not agree, do not use the platform.
          </p>
        </section>

        <section class="terms-section">
          <h2>2. User Account and Responsibilities</h2>
          <ul>
            <li>
              You are responsible for maintaining the confidentiality of your
              account.
            </li>
            <li>
              You must ensure that any content uploaded does not infringe
              third-party rights.
            </li>
          </ul>
        </section>

        <section class="terms-section">
          <h2>3. Image Ownership</h2>
          <ul>
            <li>
              You retain 100% ownership and copyright of all images uploaded.
            </li>
            <li>
              Photoreka does not sell, license, or redistribute your images
              without your explicit consent.
            </li>
          </ul>
        </section>

        <section class="terms-section">
          <h2>4. Image Storage and Resolution</h2>
          <ul>
            <li>
              Only reduced, low-resolution versions are stored on secure servers
              (Cloudflare R2) for analysis, searches, and previews.
            </li>
            <li>Original images are not permanently stored.</li>
            <li>Data is encrypted in transit and at rest.</li>
          </ul>
        </section>

        <section class="terms-section">
          <h2>5. Image Processing with AI</h2>
          <ul>
            <li>
              The images are only analyzed to extract narrative and contextual
              tags, as well as other visual and technichal aspects.
            </li>
            <li>
              Images are only analyzed; they are not edited, transformed, or
              altered in any way during processing.
            </li>
            <li>
              Processing uses proprietary open-source AI models and third-party
              AI models (including Google services) under paid/private plans
              that don't use images to train their models.
            </li>
            <li>
              Images may be temporarily transmitted to these providers solely
              for the requested functionality and under confidentiality
              agreements, and they are not stored in this process.
            </li>
            <li>
              <strong>Consent Regarding AI Processing:</strong> By using
              Photoreka, you acknowledge and accept that your images will be
              processed using AI models as described above. If you do not agree
              to such processing, you should refrain from uploading images or
              using the platform.
            </li>
          </ul>
        </section>

        <section class="terms-section">
          <h2>6. Sharing and Third Parties</h2>
          <ul>
            <li>
              Images are never shared publicly or with unauthorized third
              parties.
            </li>
            <li>
              Third-party service providers may access images only as strictly
              necessary for platform functionality and under binding
              confidentiality obligations.
            </li>
          </ul>
        </section>

        <section class="terms-section">
          <h2>7. Retention and Deletion</h2>
          <ul>
            <li>You can delete your images at any time.</li>
            <li>
              Upon deletion, stored copies and derived data are removed within
              30 days, except where legal retention obligations apply.
            </li>
          </ul>
        </section>

        <section class="terms-section">
          <h2>8. Limited License</h2>
          <p>
            By uploading images, you grant Photoreka a limited, non-exclusive,
            revocable license to store, process, and analyze images solely to
            provide platform functionalities.
          </p>
        </section>

        <section class="terms-section">
          <h2>9. Liability and Disclaimer</h2>
          <ul>
            <li>Photoreka provides services "as is."</li>
            <li>
              We are not liable for any indirect damages arising from the use of
              the platform.
            </li>
            <li>
              Users are responsible for the legality and appropriateness of
              uploaded content.
            </li>
          </ul>
        </section>

        <section class="terms-section">
          <h2>10. Sensitive and Personal Images Disclaimer</h2>
          <p>
            Photoreka is intended solely for the management and analysis of
            artistic or documentary photographic bodies of work that may be
            suitable for public or professional presentation. The platform is
            not recommended for the storage or processing of sensitive, private,
            or personal images. Users are strongly advised not to upload images
            containing personal, confidential, or sensitive content. Photoreka
            does not function as a personal storage service and expressly
            disclaims any responsibility for potential data breaches or
            unauthorized disclosures of such content. By using Photoreka, you
            acknowledge and accept that the platform is not liable for any
            consequences arising from the upload of sensitive or personal
            images.
          </p>
        </section>
      </div>
    </div>

    <!-- Footer -->
    <footer class="landing-footer">
      <div class="footer-container">
        <div class="footer-content">
          <div class="footer-brand">
            <div class="logo">
              <img :src="logoName" alt="Photoreka" class="logo-image" />
            </div>
            <p class="footer-description">
              Discovery photo assistant and organization platform for creative
              professionals.
            </p>
          </div>
          <div class="footer-links">
            <div class="link-group">
              <h4 class="link-title">Product</h4>
              <a href="#" class="link">Features</a>
              <a href="#" class="link">Pricing</a>
              <a href="#" class="link">API</a>
            </div>
            <div class="link-group">
              <h4 class="link-title">Company</h4>
              <a href="#" class="link">About</a>
              <a href="#" class="link">Blog</a>
              <a href="#" class="link">Careers</a>
            </div>
            <div class="link-group">
              <h4 class="link-title">Legal</h4>
              <a @click="goHome" class="link">Terms & Image Policy</a>
              <a href="#" class="link">Privacy</a>
              <a href="#" class="link">Contact</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p class="copyright">© 2024 Photoreka. All rights reserved.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { NButton } from "naive-ui";
import AppLogo from "@/components/AppLogo.vue";

const router = useRouter();

const goHome = () => {
  router.push({ name: "landing" });
};
</script>

<style scoped>
.terms-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0f0f13 0%, #16161a 100%);
  color: var(--text-primary);
}

/* Navigation */
.landing-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: rgba(15, 15, 19, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
}

.nav-brand .logo {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-shrink: 0;
}

.logo-image {
  height: 50px;
  width: auto;
  object-fit: contain;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

/* Terms Content */
.terms-container {
  padding-top: 100px;
  padding-bottom: 60px;
  max-width: 900px;
  margin: 0 auto;
  padding-left: 24px;
  padding-right: 24px;
}

.terms-content {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.terms-title {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 40px;
  color: var(--text-primary);
  text-align: center;
  line-height: 1.2;
}

.terms-section {
  margin-bottom: 32px;
}

.terms-section h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
  border-bottom: 2px solid var(--primary-color);
  padding-bottom: 8px;
}

.terms-section p {
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 16px;
}

.terms-section ul {
  margin: 0;
  padding-left: 20px;
}

.terms-section li {
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 8px;
}

/* Footer */
.landing-footer {
  background: #0a0a0e;
  padding: 48px 0 24px;
}

.footer-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.footer-content {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 48px;
  margin-bottom: 32px;
}

.footer-brand .logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.footer-description {
  color: var(--text-secondary);
  line-height: 1.6;
}

.footer-links {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
}

.link-title {
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.link {
  display: block;
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: 8px;
  transition: color 0.2s ease;
  cursor: pointer;
}

.link:hover {
  color: var(--primary-color);
}

.footer-bottom {
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  text-align: center;
}

.copyright {
  color: var(--text-tertiary);
  font-size: 14px;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .terms-container {
    padding-left: 16px;
    padding-right: 16px;
  }

  .terms-content {
    padding: 24px;
  }

  .terms-title {
    font-size: 24px;
    margin-bottom: 32px;
  }

  .terms-section h2 {
    font-size: 18px;
  }

  .nav-container {
    padding: 0 16px;
  }

  .footer-content {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .footer-links {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}

@media (max-width: 480px) {
  .terms-container {
    padding-left: 12px;
    padding-right: 12px;
  }

  .terms-content {
    padding: 20px;
  }

  .terms-title {
    font-size: 20px;
  }

  .terms-section h2 {
    font-size: 16px;
  }

  .nav-container {
    padding: 0 12px;
  }

  .footer-container {
    padding: 0 12px;
  }
}
</style>
