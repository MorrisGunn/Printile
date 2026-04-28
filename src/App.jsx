import { useState, useEffect, useRef, useCallback } from "react";
import { jsPDF } from "jspdf";

function App() {
    const containerRef = useRef(null);

    const [image, setImage] = useState(null);

    const [widthInches, setWidthInches] = useState(10);
    const [heightInches, setHeightInches] = useState(10);

    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    const [dragging, setDragging] = useState(false);
    const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });

    const [touching, setTouching] = useState(false);
    const [lastTouchDist, setLastTouchDist] = useState(null);

    const MIN_SCALE = 0.1;
    const MAX_SCALE = 10;

    const DPI = 100;

    // -------------------------
    // Upload image
    // -------------------------
    function handleUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        setImage(url);
    }

    // -------------------------
    // Print math
    // -------------------------
    const w = Number(widthInches) || 1;
    const h = Number(heightInches) || 1;

    const scaledWidthPx = w * DPI;
    const scaledHeightPx = h * DPI;

    const marginInches = 0.25;

    const usablePageWidthPx = (8.5 - marginInches * 2) * DPI;
    const usablePageHeightPx = (11 - marginInches * 2) * DPI;

    const tilesX = Math.max(
        1,
        Math.ceil(scaledWidthPx / usablePageWidthPx)
    );

    const tilesY = Math.max(
        1,
        Math.ceil(scaledHeightPx / usablePageHeightPx)
    );

    // -------------------------
    // Fit to screen
    // -------------------------
    const fitToScreen = useCallback(() => {
        if (!containerRef.current || !image) return;

        const el = containerRef.current;

        const fitX = el.clientWidth / scaledWidthPx;
        const fitY = el.clientHeight / scaledHeightPx;

        const newScale = Math.min(fitX, fitY);

        setScale(newScale);
        setOffset({ x: 0, y: 0 });
    }, [image, scaledWidthPx, scaledHeightPx]);

    useEffect(() => {
        fitToScreen();
    }, [fitToScreen]);

    // -------------------------
    // PAN
    // -------------------------
    function handleMouseDown(e) {
        setDragging(true);
        setLastMouse({ x: e.clientX, y: e.clientY });
    }

    function handleMouseMove(e) {
        if (!dragging) return;

        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;

        setOffset((prev) => ({
            x: prev.x + dx,
            y: prev.y + dy,
        }));

        setLastMouse({ x: e.clientX, y: e.clientY });
    }

    function handleMouseUp() {
        setDragging(false);
    }
    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    function handleTouchStart(e) {
        if (e.touches.length === 1) {
            setDragging(true);
            setLastMouse({
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            });
        }

        if (e.touches.length === 2) {
            setTouching(true);
            setLastTouchDist(getTouchDistance(e.touches));
        }
    }

    function handleTouchMove(e) {
        e.preventDefault();

        // 1 finger pan
        if (e.touches.length === 1 && dragging) {
            const dx = e.touches[0].clientX - lastMouse.x;
            const dy = e.touches[0].clientY - lastMouse.y;

            setOffset(prev => ({
                x: prev.x + dx,
                y: prev.y + dy
            }));

            setLastMouse({
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            });
        }

        // 2 finger pinch zoom
        if (e.touches.length === 2) {
            const dist = getTouchDistance(e.touches);

            if (lastTouchDist) {
                const zoomFactor = dist / lastTouchDist;

                const newScale = Math.max(
                    0.1,
                    Math.min(10, scale * zoomFactor)
                );

                setScale(newScale);
            }

            setLastTouchDist(dist);
        }
    }

    function handleTouchEnd() {
        setDragging(false);
        setTouching(false);
        setLastTouchDist(null);
    }

    // -------------------------
    // ZOOM (fixed, no page scroll)
    // -------------------------
    const handleWheel = useCallback(
        (e) => {
            e.preventDefault();

            const zoomFactor = 1.1;

            const rect = containerRef.current.getBoundingClientRect();

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const direction = e.deltaY < 0 ? 1 : -1;

            let newScale =
                direction > 0 ? scale * zoomFactor : scale / zoomFactor;

            newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

            const ratio = newScale / scale;

            setOffset({
                x: mouseX - (mouseX - offset.x) * ratio,
                y: mouseY - (mouseY - offset.y) * ratio,
            });

            setScale(newScale);
        },
        [scale, offset]
    );

    // attach non-passive wheel listener (THIS is what fixes scrolling)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onWheel = (e) => {
            e.preventDefault();
            handleWheel(e);
        };

        el.addEventListener("wheel", onWheel, { passive: false });

        return () => {
            el.removeEventListener("wheel", onWheel);
        };
    }, [handleWheel]);

    // -------------------------
    // PDF EXPORT
    // -------------------------
    function exportPDF() {
        if (!image) return;

        const img = new Image();
        img.src = image;

        img.onload = () => {
            const pdf = new jsPDF({
                unit: "in",
                format: "letter",
            });

            const margin = marginInches;

            const usableW = 8.5 - margin * 2;
            const usableH = 11 - margin * 2;

            const imgW = scaledWidthPx;
            const imgH = scaledHeightPx;

            const tilesX = Math.ceil(imgW / usablePageWidthPx);
            const tilesY = Math.ceil(imgH / usablePageHeightPx);

            let first = true;

            for (let y = 0; y < tilesY; y++) {
                for (let x = 0; x < tilesX; x++) {
                    if (!first) pdf.addPage();

                    const sx = x * usablePageWidthPx;
                    const sy = y * usablePageHeightPx;

                    const sw = Math.min(usablePageWidthPx, imgW - sx);
                    const sh = Math.min(usablePageHeightPx, imgH - sy);

                    const canvas = document.createElement("canvas");
                    canvas.width = sw;
                    canvas.height = sh;

                    const ctx = canvas.getContext("2d");

                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

                    const data = canvas.toDataURL("image/png");

                    pdf.addImage(data, "PNG", margin, margin, sw / DPI, sh / DPI);

                    first = false;
                }
            }

            pdf.save("printile-output.pdf");
        };
    }

    // -------------------------
    // UI
    // -------------------------
    return (
        <div style={{ padding: "20px" }}>
            <h1>Printile</h1>

            <input type="file" accept="image/*" onChange={handleUpload} />

            <div style={{ marginTop: "10px" }}>
                Width (inches):
                <input
                    type="number"
                    value={widthInches}
                    onChange={(e) => setWidthInches(Number(e.target.value))}
                    style={{ marginLeft: "10px", width: "80px" }}
                />
            </div>

            <div style={{ marginTop: "10px" }}>
                Height (inches):
                <input
                    type="number"
                    value={heightInches}
                    onChange={(e) => setHeightInches(Number(e.target.value))}
                    style={{ marginLeft: "10px", width: "80px" }}
                />
            </div>

            <div style={{ marginTop: "10px" }}>
                Pages: {tilesX} × {tilesY} ({tilesX * tilesY} total)
            </div>

            <button onClick={fitToScreen} style={{ marginTop: "10px" }}>
                Reset View
            </button>

            <button
                onClick={exportPDF}
                style={{ marginTop: "10px", marginLeft: "10px" }}
            >
                Export PDF
            </button>

            <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    position: "relative",
                    width: "100%",
                    height: "70vh",
                    marginTop: "20px",
                    border: "2px dashed gray",
                    background: "#fafafa",
                    overflow: "hidden",
                    cursor: dragging ? "grabbing" : "grab",
                    touchAction: "none"
                }}
            >
                {image && (
                    <img
                        src={image}
                        draggable={false}
                        style={{
                            position: "absolute",
                            left: offset.x,
                            top: offset.y,
                            width: scaledWidthPx * scale,
                            height: scaledHeightPx * scale,
                        }}
                    />
                )}
            </div>
        </div>
    );
}

export default App;