// @ts-nocheck

export default function withCPUWarmUp(target, propertyKey, descriptor) {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args) {
    await this.ensureCPUApiWarm()
    return originalMethod.apply(this, args)
  }

  return descriptor
}
