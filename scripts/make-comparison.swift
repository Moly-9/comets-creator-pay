import AppKit
import Foundation

guard CommandLine.arguments.count >= 4 else {
  fputs("usage: make-comparison.swift output.png input1.png input2.png [...]\n", stderr)
  exit(1)
}

let outputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let inputURLs = CommandLine.arguments.dropFirst(2).map(URL.init(fileURLWithPath:))
let images = inputURLs.compactMap(NSImage.init(contentsOf:))

guard images.count == inputURLs.count else {
  fputs("failed to load one or more images\n", stderr)
  exit(1)
}

let targetHeight: CGFloat = 900
let gutter: CGFloat = 24
let scaledSizes = images.map { image -> NSSize in
  let scale = min(1, targetHeight / image.size.height)
  return NSSize(width: image.size.width * scale, height: image.size.height * scale)
}
let canvasSize = NSSize(
  width: scaledSizes.reduce(0) { $0 + $1.width } + gutter * CGFloat(images.count - 1),
  height: targetHeight
)

let canvas = NSImage(size: canvasSize)
canvas.lockFocus()
NSColor(calibratedWhite: 0.94, alpha: 1).setFill()
NSRect(origin: .zero, size: canvasSize).fill()

var x: CGFloat = 0
for (image, size) in zip(images, scaledSizes) {
  let destination = NSRect(
    x: x,
    y: canvasSize.height - size.height,
    width: size.width,
    height: size.height
  )
  image.draw(in: destination, from: .zero, operation: .sourceOver, fraction: 1)
  x += size.width + gutter
}
canvas.unlockFocus()

guard
  let tiff = canvas.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiff),
  let png = bitmap.representation(using: .png, properties: [:])
else {
  fputs("failed to render comparison\n", stderr)
  exit(1)
}

try png.write(to: outputURL)
