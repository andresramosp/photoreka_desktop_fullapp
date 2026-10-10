const onboardingConfig = {
  // Hybrid onboarding: users who already got a free quota also see the photo
  // packs at the end of the profile wizard, with the free pack as first option.
  // Users with no free quota always see them, as a required purchase.
  offersPacks: String(process.env.ONBOARDING_OFFERS_PACKS ?? '').toLowerCase() === 'true',
}

export default onboardingConfig
