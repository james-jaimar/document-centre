<final-text>
Do I know what the issue is? Yes.

The current pipeline is still too permissive and too layered:

1. The rotate button is calling a generic 90° rotate path, then the app trusts whatever metadata comes back. If that path does not produce a genuinely portrait-normalised asset in the live backend, the frontend still marks the document as resolved and renders it.
2. Portrait products only warn; they do not hard-block landscape documents at every downstream point. So a bad landscape asset can still be selected, assigned, and opened in Configure.
3. The Configure preview then uses the document’s actual landscape aspect ratio, while the product/binding options are portrait-oriented. That is why the preview becomes internally inconsistent.
4. The binding preview now has a CSS fallback strip showing when artwork fails or mismatches. That fallback is masking the real problem instead of enforcing the finite one-to-one artwork mapping.

Plan to fix this properly:

1. Replace the orientation action with a target-orientation flow
   - Stop using the generic `rotate(assetId, 90)` from the customer rotation modal.
   - Use the existing backend `normalize-orientation` operation with an explicit target:
     - portrait products: `dominant = "portrait"`
     - presentations: `dominant = "landscape"`
   - After the job completes, re-fetch the asset and verify the resulting dimensions actually match the target orientation before marking the document resolved.
   - If verification fails, keep the document in review/error state and do not render or allow assignment.

2. Make portrait/landscape enforcement impossible to bypass
   - Create one shared product-orientation policy used by upload, file assignment, and Configure.
   - Portrait-required products: Bound Documents, Ring Binders, Booklets.
   - Landscape-required products: Presentations.
   - Remove the “dismiss and keep as-is” path for mandatory product mismatch. The user can rotate or switch product, but cannot proceed with a landscape file in a portrait product.
   - Block “Add Selected File As” if the selected document orientation does not match the product.
   - Disable/guard “Configure Options” if any assigned section has an unresolved or non-compliant orientation.
   - Add the same guard on `OrderBuild` so direct navigation cannot open a broken preview.

3. Fix the render order after orientation correction
   - Orientation normalise first.
   - Re-fetch authoritative backend dimensions.
   - Run print-ready conversion only after the document geometry is final.
   - Clear old thumbnails/signed URLs.
   - Render thumbnails from the promoted normalised PDF.
   - Persist only the verified portrait/landscape dimensions and fresh thumbnail paths.

4. Clean up stale artifact competition
   - Keep the backend page-render cleanup after geometry-changing operations.
   - Also clear top-level thumbnail/preview pointers when print-ready rewrites the normalised PDF, as a defensive safety measure.
   - Keep the geometry-aware thumbnail picker, but make it a fallback safety net rather than the main fix.

5. Repair the binding artwork path
   - Audit `src/assets/bindings` against `bindingAssets.ts` and make the mapping exact for every supported method/colour/edge/state combination.
   - Remove the generic grey CSS strip as the normal fallback for known binding combinations; missing artwork should not silently render as fake bars.
   - Force portrait products to use long-edge/left binding artwork. Short-edge artwork should only be used for the landscape product flow.
   - Update the saved preview snapshot logic to treat `binding_edge: "short"` consistently, so live preview and placed-order preview match.

6. Add regression checks around the failure case
   - Add focused tests for the orientation policy helper:
     - landscape file + Bound Documents = blocked until rotated
     - rotated portrait result = allowed
     - portrait file + Presentations = blocked until rotated
   - Add tests for binding artwork resolution so supported combinations resolve to real imported artwork instead of CSS fallback.

Files I expect to change:
- `src/pages/dashboard/OrderFiles.tsx`
- `src/hooks/useDocumentUpload.ts`
- `src/lib/documentCentreApi.ts` if a clearer helper wrapper is needed
- `src/pages/dashboard/OrderBuild.tsx`
- `src/components/order/FileList.tsx` / `SectionActions.tsx` if we surface disabled states
- `src/components/preview/BindingSpine.tsx`
- `src/components/preview/bindingAssets.ts`
- `src/lib/orders/buildPreviewSnapshot.ts`
- `pdf-server/app/tasks/operation_tasks.py`

Expected result:
- Uploading a landscape PDF to a portrait product opens the advisory.
- Clicking Rotate produces a verified portrait document before any preview is shown.
- If rotation fails, the app blocks progression instead of pretending it succeeded.
- Configure cannot show a landscape document inside a portrait product.
- Binding artwork uses the correct real asset for the selected binding option and product orientation.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>
</final-text>