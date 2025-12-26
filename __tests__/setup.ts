import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock IntersectionObserver for infinite scroll tests
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []

  constructor(
    private callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit
  ) {}

  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// Mock PointerEvent for Radix UI components
class MockPointerEvent extends MouseEvent {
  public pointerId: number
  public pointerType: string
  public pressure: number
  public tangentialPressure: number
  public tiltX: number
  public tiltY: number
  public twist: number
  public width: number
  public height: number
  public isPrimary: boolean

  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props)
    this.pointerId = props.pointerId ?? 0
    this.pointerType = props.pointerType ?? 'mouse'
    this.pressure = props.pressure ?? 0
    this.tangentialPressure = props.tangentialPressure ?? 0
    this.tiltX = props.tiltX ?? 0
    this.tiltY = props.tiltY ?? 0
    this.twist = props.twist ?? 0
    this.width = props.width ?? 1
    this.height = props.height ?? 1
    this.isPrimary = props.isPrimary ?? false
  }

  getCoalescedEvents(): PointerEvent[] {
    return []
  }

  getPredictedEvents(): PointerEvent[] {
    return []
  }
}

Object.defineProperty(window, 'PointerEvent', {
  writable: true,
  configurable: true,
  value: MockPointerEvent,
})

// Mock hasPointerCapture for Radix UI Select
Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
Element.prototype.setPointerCapture = vi.fn()
Element.prototype.releasePointerCapture = vi.fn()

// Mock scrollIntoView for Radix UI
Element.prototype.scrollIntoView = vi.fn()

const createMatchMedia = (matches: boolean) => ({
  matches,
  media: '',
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => createMatchMedia(false)),
})

Object.defineProperty(window, 'innerWidth', {
  writable: true,
  value: 1024,
})
