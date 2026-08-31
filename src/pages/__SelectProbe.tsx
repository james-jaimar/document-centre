import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SelectProbe() {
  return (
    <div className="w-[320px] space-y-1.5 p-6">
      <Label className="text-xs">Finishing option</Label>
      <Select value="a">
        <SelectTrigger id="probe-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Complete deskpad - collated, padded{"{head}"} + Corners</SelectItem>
          <SelectItem value="b">Untrimmed flat sheet + collating only</SelectItem>
        </SelectContent>
      </Select>
      <Select value="q">
        <SelectTrigger id="probe-short">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="q">10 — R 2 392,00</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
