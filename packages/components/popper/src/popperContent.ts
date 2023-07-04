import type { PropType, Ref } from 'vue'
import { computed, defineComponent, h, onMounted, ref, toRefs, watch } from 'vue'

import type { ElementType, MergeProps, PrimitiveProps } from '@oku-ui/primitive'
import type { Scope } from '@oku-ui/provide'
import { useCallbackRef, useRef, useSize } from '@oku-ui/use-composable'
import { autoUpdate, flip, arrow as floatingUIarrow, hide, limitShift, offset, shift, size, useFloating } from '@floating-ui/vue'
import type {
  DetectOverflowOptions,
  Middleware,
  Padding,
  Placement,
} from '@floating-ui/vue'
import type { Align, Side } from './utils'
import { ALIGN_OPTIONS, SIDE_OPTIONS, getSideAndAlignFromPlacement, isDefined, isNotNull, transformOrigin } from './utils'
import type { PopperInjectValue } from './popper'
import { createPopperProvider, usePopperInject } from './popper'

const CONTENT_NAME = 'PopperContent'

type PopperContentContextValue = {
  placedSide: Ref<Side>
  arrow: Ref<HTMLSpanElement | null>
  arrowX?: Ref<string>
  arrowY?: Ref<string>
  shouldHideArrow: Ref<boolean>
  x?: Ref<number>
  y?: Ref<number>
} & PopperInjectValue

export const [PopperContentProvider, usePopperContentInject] = createPopperProvider<PopperContentContextValue>(CONTENT_NAME)

type Boundary = Element | null

type PopperContentElement = ElementType<'div'>
interface PopperContentProps extends PrimitiveProps {
  side?: Side
  sideOffset?: number
  align?: Align
  alignOffset?: number
  arrowPadding?: number
  avoidCollisions?: boolean
  collisionBoundary?: Boundary | Boundary[]
  collisionPadding?: Padding
  sticky?: 'partial' | 'always'
  hideWhenDetached?: boolean
  updatePositionStrategy?: 'optimized' | 'always'
  onPlaced?: () => void
}

const PopperContent = defineComponent({
  name: CONTENT_NAME,
  inheritAttrs: false,
  props: {
    side: {
      type: String as unknown as PropType<Side>,
      required: false,
      default: 'bottom',
      validator: (value: Side) => SIDE_OPTIONS.includes(value),
    },
    sideOffset: {
      type: Number,
      required: false,
      default: 0,
    },
    align: {
      type: String as unknown as PropType<Align>,
      required: false,
      default: 'center',
      validator: (value: Align) => ALIGN_OPTIONS.includes(value),
    },
    alignOffset: {
      type: Number,
      required: false,
      default: 0,
    },
    arrowPadding: {
      type: Number,
      required: false,
      default: 0,
    },
    avoidCollisions: {
      type: Boolean,
      required: false,
      default: true,
    },
    collisionBoundary: {
      type: [Object, Array] as unknown as PropType<Boundary | Boundary[]>,
      required: false,
      default: () => [],
    },
    collisionPadding: {
      type: [Number, Object] as unknown as PropType<Padding>,
      required: false,
      default: 0,
    },
    sticky: {
      type: String as unknown as PropType<'partial' | 'always'>,
      required: false,
      default: 'partial',
    },
    hideWhenDetached: {
      type: Boolean,
      required: false,
      default: false,
    },
    updatePositionStrategy: {
      type: String as unknown as PropType<'optimized' | 'always'>,
      required: false,
      default: 'optimized',
    },
    onPlaced: {
      type: Function as unknown as PropType<() => void>,
      required: false,
      default: undefined,
    },
    scopePopper: {
      type: Object as unknown as PropType<Scope>,
      required: false,
    },
  },
  setup(props, { attrs, expose, slots }) {
    const {
      side,
      sideOffset,
      align,
      alignOffset,
      arrowPadding,
      avoidCollisions,
      collisionBoundary,
      collisionPadding: collisionPaddingProp,
      sticky,
      hideWhenDetached,
      updatePositionStrategy,
      onPlaced,
      scopePopper,
    } = toRefs(props)

    const { ...attrsElement } = attrs as PopperContentElement

    const inject = usePopperInject(CONTENT_NAME, scopePopper.value)

    const content = ref<HTMLDivElement | null>(null)
    const { $el, newRef } = useRef<HTMLDivElement>()

    const arrow = ref<HTMLSpanElement | null>(null)
    const arrowSize = useSize(arrow)

    const arrowWidth = computed(() => arrowSize.value?.width || 0)
    const arrowHeight = computed(() => arrowSize.value?.height || 0)

    const desiredPlacement = computed(() => (side.value + (align.value !== 'center' ? `-${align.value}` : '')) as Placement)

    const collisionPadding
      = typeof collisionPaddingProp.value === 'number'
        ? collisionPaddingProp.value as Padding
        : { top: 0, right: 0, bottom: 0, left: 0, ...collisionPaddingProp.value } as Padding

    const boundary = Array.isArray(collisionBoundary.value) ? collisionBoundary.value : [collisionBoundary.value]
    const hasExplicitBoundaries = boundary.length > 0

    const detectOverflowOptions = {
      padding: collisionPadding,
      boundary: boundary.filter(isNotNull),
      // with `strategy: 'fixed'`, this is the only way to get it to respect boundaries
      altBoundary: hasExplicitBoundaries,
    } as DetectOverflowOptions

    const _middleware = computed(() => {
      const toReturn: Middleware[] = []
      toReturn.push(
        offset({ mainAxis: sideOffset.value + arrowHeight.value, alignmentAxis: alignOffset.value }),
      )

      if (avoidCollisions.value) {
        toReturn.push(shift({
          mainAxis: true,
          crossAxis: false,
          limiter: sticky.value === 'partial' ? limitShift() : undefined,
          ...detectOverflowOptions,
        }))
        toReturn.push(flip({ ...detectOverflowOptions }))
      }

      toReturn.push(
        size({
          ...detectOverflowOptions,
          apply: ({ elements, rects, availableWidth, availableHeight }) => {
            const { width: anchorWidth, height: anchorHeight } = rects.reference
            const contentStyle = elements.floating.style
            contentStyle.setProperty('--oku-popper-available-width', `${availableWidth}px`)
            contentStyle.setProperty('--oku-popper-available-height', `${availableHeight}px`)
            contentStyle.setProperty('--oku-popper-anchor-width', `${anchorWidth}px`)
            contentStyle.setProperty('--oku-popper-anchor-height', `${anchorHeight}px`)
          },
        }),
      )

      if (arrow.value)
        toReturn.push(floatingUIarrow({ element: arrow.value, padding: arrowPadding.value }))

      toReturn.push(transformOrigin({ arrowWidth: arrowWidth.value, arrowHeight: arrowHeight.value }))

      if (hideWhenDetached.value)
        toReturn.push(hide({ strategy: 'referenceHidden', ...detectOverflowOptions }))

      return toReturn.filter(isDefined)
    })

    const { x, y, floatingStyles, placement, isPositioned, middlewareData, update } = useFloating(inject.value.anchor, newRef, {
      // default to `fixed` strategy so users don't have to pick and we also avoid focus scroll issues
      strategy: 'fixed',
      placement: desiredPlacement,
      whileElementsMounted: (...args) => {
        const cleanup = autoUpdate(...args, {
          animationFrame: updatePositionStrategy.value === 'optimized',
        })
        return cleanup
      },
      middleware: _middleware,
    })

    // watch(arrowSize, () => {

    // })

    const placedSide = ref<Side>(side.value)
    const placedAlign = ref<Align>(align.value)

    watch(placement, () => {
      const [newSide, newAlign] = getSideAndAlignFromPlacement(placement.value)
      placedSide.value = newSide
      placedAlign.value = newAlign
    })

    onMounted(() => {
      update()
    })

    const handlePlaced = useCallbackRef(onPlaced.value)

    watch([isPositioned, handlePlaced], () => {
      if (isPositioned.value)
        handlePlaced?.()
    })

    const arrowX = computed(() => `${middlewareData.value.arrow?.x || 0}px`)
    const arrowY = computed(() => `${middlewareData.value.arrow?.y || 0}px`)
    const cannotCenterArrow = computed(() => middlewareData.value.arrow?.centerOffset !== 0)

    // watch(middlewareData, () => {
    //   arrowX.value = `${middlewareData.value.arrow?.x || 0}px`
    //   arrowY.value = `${middlewareData.value.arrow?.y || 0}px`
    //   cannotCenterArrow.value = middlewareData.value.arrow?.centerOffset !== 0
    // })

    const contentZIndex = ref()
    watch(content, () => {
      if (content.value)
        contentZIndex.value = window.getComputedStyle(content.value).zIndex
    })

    PopperContentProvider({
      arrowX,
      arrowY,
      scope: scopePopper.value,
      shouldHideArrow: cannotCenterArrow,
      arrow,
      placedSide,
      anchor: inject.value.anchor,
      x,
      y,
    })
    const originalReturn = () =>
      h('div',
        {
          'ref': newRef,
          'data-oku-popper-content-wrapper': '',
          'style': {
            position: floatingStyles.value.position,
            left: `${floatingStyles.value.left}px`,
            top: `${floatingStyles.value.top}px`,
            transform: isPositioned.value ? floatingStyles.value.transform : 'translate(0, -200%)', // keep off the page when measuring
            minWidth: 'max-content',
            zIndex: contentZIndex.value,
            ['--oku-popper-transform-origin' as any]: [
              middlewareData.value.transformOrigin?.x,
              middlewareData.value.transformOrigin?.y,
            ].join(' '),
          },
          'dir': attrsElement.dir,

        },
        [
          h('div',
            {
              'data-side': placedSide,
              'data-align': placedAlign,
              ...attrsElement,
              'style': {
                ...attrsElement.style as any,
                // if the PopperContent hasn't been placed yet (not all measurements done)
                // we prevent animations so that users's animation don't kick in too early referring wrong sides
                animation: !isPositioned.value ? 'none' : undefined,
                // hide the content if using the hide middleware and should be hidden
                opacity: middlewareData.value.hide?.referenceHidden ? 0 : undefined,
              },
            },
            {
              default: () => slots.default?.(),
            },
          ),

        ],
      )

    return originalReturn
  },
})

type _PopperContent = MergeProps<PopperContentProps, PopperContentElement>

const OkuPopperContent = PopperContent as typeof PopperContent & (new () => { $props: _PopperContent })

export {
  OkuPopperContent,
}

export type {
  PopperContentProps,
}